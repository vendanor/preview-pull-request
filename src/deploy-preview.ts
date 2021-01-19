import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { CommandResult, Options } from './common';
import {
  createComment,
  findPreviousComment,
  getCurrentContext,
  getCurrentPullRequestId,
  getLatestCommitShortSha, updateComment
} from './github-util';
import { generateHash } from './generate-hash';
import { runCmd } from './run-cmd';
import { loginDockerRegistry } from './docker-util';
import { loginAzure } from './az-login';

/**
 * This will:
 * - build docker image + tag with correct semver meta preview tags
 * - publish docker image to container registry
 * - build helm chart + tag with preview semver meta tags
 * - publish helm chart to chart repo (mandatory or optional?)
 * - deploy chart / preview in Kubernetes
 * - add a preview comment to pull request
 * - message teams?
 * - return preview url, helm chart name, docker image name
 * @param options
 */
export async function deployPreview(options: Options): Promise<CommandResult> {
  core.info('Starting deploy preview...9');

  // Gather info
  const sha7 = await getLatestCommitShortSha(options.githubToken);
  const pullRequestId = await getCurrentPullRequestId(options.githubToken);
  const context = await getCurrentContext();
  const githubRunNumber = context.runNumber;
  const tagPostfix = `-preview.${pullRequestId}.${sha7}`; // used for both docker tag and helm tag

  // == DOCKER ==
  // build docker image
  const dockerImageName = `${options.dockerRegistry}/${options.dockerOrganization}/${options.dockerImageName}`;
  const dockerImageVersion = `${dockerImageName}:${options.dockerTagMajor}.${githubRunNumber}${tagPostfix}`;
  core.info('Building docker image: ' + dockerImageVersion);
  const workspaceFolder = process.env.GITHUB_WORKSPACE || '.';
  await exec.exec(`pwd`);
  await exec.exec(`ls -al`);
  await exec.exec(`ls -al ${workspaceFolder}`);

  // GITHUB_WORKSPACE:
  // /home/runner/work/VnConnectApp/VnConnectApp

  // COPY failed: stat /var/lib/docker/tmp/docker-builder387360906/dist: no such file or directory

  const dockerBuildResult = await runCmd('docker', [
    'build',
    workspaceFolder,
    '-t',
    dockerImageVersion,
    '-f',
    options.dockerFile
  ]);
  core.info('Build docker image result code:' + dockerBuildResult.resultCode);
  core.info(dockerBuildResult.output);
  // publish docker image:
  await loginDockerRegistry(
    options.dockerUsername,
    options.dockerPassword,
    options.dockerRegistry
  );
  const dockerPushResult = await runCmd('docker', ['push', dockerImageName]);

  // === HELM chart ===
  const chartVersion = `${options.helmTagMajor}.${githubRunNumber}${tagPostfix}`;
  const chartFilename = `${options.helmChartFilename}-${options.helmTagMajor}.${githubRunNumber}${tagPostfix}.tgz`;
  const appVersionClean = `${options.dockerTagMajor}.${githubRunNumber}${tagPostfix}`;
  await exec.exec('helm', [
    'pack',
    options.helmChartFilename,
    '--version',
    chartVersion,
    '--app-version',
    appVersionClean,
    '--set',
    `image=${chartVersion}`
  ]);

  // publish helm chart?
  if (!!options.helmRepoUrl) {
    await exec.exec('helm', [
      'plugin',
      'install',
      'https://github.com/chartmuseum/helm-push.git'
    ]);
    await exec.exec('helm', ['repo', 'add', 'vendanor', options.helmRepoUrl]);
    await exec.exec('helm', ['repo', 'update']);
    await exec.exec('helm', ['push', chartFilename, options.helmOrganization]);
  }

  // === Connect K8S ===
  await loginAzure(options.azureToken);

  // === Install or upgrade Helm preview release! ===
  core.info('Ready to deploy to AKS...');
  const hash = generateHash(pullRequestId, options.hashSalt);
  const previewUrlIdentifier = `${options.appName}-${pullRequestId}-${hash}`;
  const completePreviewUrl = `${previewUrlIdentifier}.${options.baseUrl}`;
  const helmReleaseName = `preview-${options.appName}-${pullRequestId}-${hash}`;
  const finalResult = await exec.exec('helm', [
    'upgrade',
    helmReleaseName,
    chartFilename,
    '--install',
    `--set namespace=${options.helmNamespace}`,
    `--set image=${dockerImageVersion}`,
    `--set pullsecret=${options.dockerPullSecret}`,
    `--set url=${completePreviewUrl}`,
    `--set appname=${previewUrlIdentifier}`,
    `--set containersuffix=${githubRunNumber}`
  ]);

  // === Post comment with preview url to Pull Request ===
  const header = `=== VnKubePreview ===`;

  function getMessage(resultCode: number) {
    if (resultCode === 0) {
      return `
        ![vn](https://app.vendanor.com/img/favicon/android-chrome-192x192.png "vn")
        ## 🔥🔥 Preview :: Great success! 🔥🔥
        Your preview (${sha7}) is available here:
        <https://${completePreviewUrl}>
      `;
    } else {
      return `
        ![vn](https://app.vendanor.com/img/favicon/android-chrome-192x192.png "vn")
        ## 🚨🚨 Preview :: Last job failed! 🚨🚨
        Your preview (${sha7}) is (not yet) available here:
        <https://${completePreviewUrl}>
      `;
    }
  }

  const body = getMessage(finalResult);

  const previousComment = await findPreviousComment(
    options.githubToken,
    context.repo,
    pullRequestId,
    header
  );

  if (previousComment) {
    await updateComment(options.githubToken, context.repo, previousComment.id, body, header);
  } else {
    await createComment(options.githubToken, context.repo, pullRequestId, body, header);
  }

  core.info("Message posted in PR!");

  return {
    previewUrl: completePreviewUrl,
    helmReleaseName,
    dockerImageVersion,
    success: finalResult === 0 // hmm...?
  }
}
