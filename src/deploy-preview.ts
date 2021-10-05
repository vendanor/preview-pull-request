import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { CommandResult, Options, PREVIEW_TAG_PREFIX } from './common';
import {
  getCurrentContext,
  getCurrentPullRequestId,
  getLatestCommitShortSha
} from './github-util';
import { runCmd } from './run-cmd';
import { loginContainerRegistry } from './docker-util';
import { generateHash } from './crypto-util';
import { downloadHelm } from './helm-util';
import path from 'path';

export async function deployPreview(options: Options): Promise<CommandResult> {
  core.info('Starting deploy preview...');

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
  const tagPostfix = `${PREVIEW_TAG_PREFIX}.${pullRequestId}.${githubRunNumber}`;

  // Build docker image
  const dockerImageName = `${options.dockerRegistry}/${options.dockerOrganization}/${options.dockerImageName}`;
  const dockerImageVersion = `${dockerImageName}:${options.dockerTagMajor}.0${tagPostfix}`;
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
  const dockerPushResult = await runCmd('docker', ['push', dockerImageVersion]);
  core.info('Push docker image result: ' + dockerPushResult.resultCode);

  // Pack Helm chart
  const chartVersion = `${options.helmTagMajor}.0${tagPostfix}`;
  const chartFilenameWithoutFolder = options.helmChartFilePath.replace(
    /^.*[\\\/]/,
    ''
  );
  const chartFilenameToPush = `${chartFilenameWithoutFolder}-${options.helmTagMajor}.0${tagPostfix}.tgz`;
  const appVersionClean = `${options.dockerTagMajor}.0${tagPostfix}`;

  // https://github.com/chartmuseum/helm-push/issues/103#issuecomment-933297249
  // Cant move to v3.7 yet because of bug..
  core.info('Installing helm 3.6.3...');

  const version = 'v3.6.3';
  let cachedPath = await downloadHelm(version);
  try {
    if (!process.env['PATH']?.startsWith(path.dirname(cachedPath))) {
      core.addPath(path.dirname(cachedPath));
    }
  } catch {
    //do nothing, set as output variable
  }

  console.log(
    `Helm tool version: '${version}' has been cached at ${cachedPath}`
  );

  core.info('Installing helm-pack plugin...');
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

  // publish helm chart if helm repo url is set
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
      'cm-push',
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

  // Install or upgrade Helm preview release
  core.info('Ready to deploy to AKS...');
  const hash = generateHash(pullRequestId, options.hashSalt);
  const previewUrlIdentifier = `${options.appName}-${pullRequestId}-${hash}`;
  const completePreviewUrl = `${previewUrlIdentifier}.${options.baseUrl}`;
  const helmReleaseName = `preview-${options.appName}-${pullRequestId}-${hash}`;

  const overrides = [
    `${options.helmKeyImage}=${dockerImageVersion}`,
    `${options.helmKeyNamespace}=${options.helmNamespace}`,
    `${options.helmKeyPullSecret}=${options.dockerPullSecret}`,
    `${options.helmKeyUrl}=${completePreviewUrl}`,
    `${options.helmKeyAppName}=${previewUrlIdentifier}`,
    `${options.helmKeyContainerSuffix}=${githubRunNumber}`,
    `${options.helmKeyClusterIssuer}=${options.clusterIssuer}`,
    `${options.helmKeyTlsSecretName}=${options.TlsSecretName}`
  ];

  if (options.helmValues && options.helmValues.length > 0) {
    const extraOverrides = options.helmValues.split(',');
    core.info(`Found ${extraOverrides.length} extra overrides`);
    extraOverrides.forEach(value => overrides.push(value));
  }
  const extraCmds = [];
  if (options.wait) {
    extraCmds.push('--wait');
  }

  const finalResult = await runCmd('helm', [
    'upgrade',
    helmReleaseName,
    chartFilenameToPush,
    '--install',
    '--namespace',
    options.helmNamespace,
    ...extraCmds,
    '--set',
    overrides.join(',')
  ]);

  const result = {
    previewUrl: completePreviewUrl,
    helmReleaseName,
    dockerImageVersion,
    success: finalResult.resultCode === 0
  };

  core.info(JSON.stringify(result, null, 2));
  core.info('All done!');
  return result;
}
