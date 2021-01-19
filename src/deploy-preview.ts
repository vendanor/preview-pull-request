import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { CommandResult, Options } from './common';
import {
  getCurrentContext,
  getCurrentPullRequestId,
  getLatestCommitShortSha,
} from './github-util';
import { generateHash } from './generate-hash';
import { runCmd } from './run-cmd';
import { loginContainerRegistry } from './docker-util';
import { loginAzure } from './az-login';

/**
 * This will:
 * - build docker image + tag with correct semver meta preview tags
 * - publish docker image to container registry
 * - build helm chart + tag with preview semver meta tags
 * - publish helm chart to chart repo (mandatory or optional?)
 * - deploy chart / preview in Kubernetes
 * - add a preview comment to pull request
 * - return preview url, helm chart name, docker image name
 * @param options
 */
export async function deployPreview(options: Options): Promise<CommandResult> {
  core.info('Starting deploy preview...');

  // We can set env.HELM_KUBECONTEXT I think..

  core.info('get helm version');
  await exec.exec('helm version', ['--kube-context', options.kubeConfig]);
  core.info('after get helm version');

  // Login to azure and github container registry
  await loginAzure(options.azureToken);
  await loginContainerRegistry(
    options.dockerUsername,
    options.dockerPassword,
    options.dockerRegistry
  );

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
  core.info('Push docker image...');
  const dockerPushResult = await runCmd('docker', ['push', dockerImageName]);
  core.info('Push docker image result: ' + dockerPushResult.resultCode);

  // === HELM chart ===
  const chartVersion = `${options.helmTagMajor}.${githubRunNumber}${tagPostfix}`;
  const chartFilenameWithoutFolder = options.helmChartFilePath.replace(
    /^.*[\\\/]/,
    ''
  );
  const chartFilenameToPush = `${chartFilenameWithoutFolder}-${options.helmTagMajor}.${githubRunNumber}${tagPostfix}.tgz`;

  const appVersionClean = `${options.dockerTagMajor}.${githubRunNumber}${tagPostfix}`;
  core.info('installing plugin...');
  const pluginResult = await exec.exec('helm', [
    'plugin',
    'install',
    'https://github.com/thynquest/helm-pack.git'
  ]);

  core.info('plugin installed: ' + pluginResult);

  await exec.exec('helm', [
    'pack',
    options.helmChartFilePath,
    '--version',
    chartVersion,
    '--app-version',
    appVersionClean,
    '--set',
    `image=${chartVersion}`
  ]);

  // publish helm chart?
  if (!!options.helmRepoUrl) {
    core.info('Publishing helm chart..');
    await exec.exec('helm', [
      'plugin',
      'install',
      'https://github.com/chartmuseum/helm-push.git'
    ]);
    await exec.exec('helm', [
      'repo',
      'add',
      'vendanor',
      options.helmRepoUrl,
      '--username',
      options.helmRepoUsername,
      '--password',
      options.helmRepoPassword
    ]);
    await exec.exec('helm', ['repo', 'update']);
    await exec.exec('helm', [
      'push',
      chartFilenameToPush,
      options.helmOrganization,
      '--username',
      options.helmRepoUsername,
      '--password',
      options.helmRepoPassword
    ]);
  } else {
    core.info('helm-repo-url was not set, skipping publish helm chart');
  }

  // === Install or upgrade Helm preview release! ===
  core.info('Ready to deploy to AKS...');
  const hash = generateHash(pullRequestId, options.hashSalt);
  const previewUrlIdentifier = `${options.appName}-${pullRequestId}-${hash}`;
  const completePreviewUrl = `${previewUrlIdentifier}.${options.baseUrl}`;
  const helmReleaseName = `preview-${options.appName}-${pullRequestId}-${hash}`;
  const finalResult = await exec.exec('helm', [
    'upgrade',
    helmReleaseName,
    chartFilenameToPush,
    '--install',
    `--${options.helmKeyNamespace} ${options.helmNamespace}`,
    `--set ${options.helmKeyAppName}=${previewUrlIdentifier}`,
    `--set ${options.helmKeyImage}=${dockerImageVersion}`,
    `--set ${options.helmKeyPullSecret}=${options.dockerPullSecret}`,
    `--set ${options.helmKeyUrl}=${completePreviewUrl}`,
    `--set ${options.helmKeyContainerSuffix}=${githubRunNumber}`
  ]);

  const result = {
    previewUrl: completePreviewUrl,
    helmReleaseName,
    dockerImageVersion,
    success: finalResult === 0 // hmm...?
  };

  core.info('All done! Printing returned result..');
  core.info(JSON.stringify(result, null, 2));
  return result;
}
