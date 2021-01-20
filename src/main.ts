import * as core from '@actions/core';
import { CommandResult, Options } from './common';
import { clearPreviewsForCurrentPullRequest } from './clear-preview';
import { deployPreview } from './deploy-preview';
import { dilbert } from './dilbert';
import { postOrUpdateGithubComment } from './sticky-comment';

const setOutputFromResult = (result: CommandResult) => {
  core.setOutput('preview-url', result.previewUrl);
  core.setOutput('docker-image-version', result.dockerImageVersion);
  core.setOutput('helm-release-version', result.helmReleaseName);
};

async function run(): Promise<void> {
  const options: Options = {
    cmd: core.getInput('command', { required: true }),
    azureToken: core.getInput('azure-token', { required: true }),
    appName: core.getInput('app-name'),
    helmNamespace: core.getInput('helm-namespace'),
    githubToken: core.getInput('token'),
    dockerImageName: core.getInput('docker-image-name'),
    dockerRegistry: core.getInput('docker-registry'),
    dockerOrganization: core.getInput('docker-organization'),
    dockerTagMajor: core.getInput('docker-tag-major'),
    dockerFile: core.getInput('docker-file'),
    dockerUsername: core.getInput('docker-username'),
    dockerPassword: core.getInput('docker-password'),
    dockerPullSecret: core.getInput('docker-pullsecret'),
    hashSalt: core.getInput('hash-salt'),
    helmTagMajor: core.getInput('helm-tag-major'),
    helmChartFilePath: core.getInput('helm-chart'),
    helmRepoUrl: core.getInput('helm-repo-url'),
    helmOrganization: core.getInput('helm-organization'),
    baseUrl: core.getInput('base-url'),
    helmRepoUsername: core.getInput('helm-repo-user'),
    helmRepoPassword: core.getInput('helm-repo-password'),
    helmKeyAppName: core.getInput('helm-key-appname'),
    helmKeyContainerSuffix: core.getInput('helm-key-containersuffix'),
    helmKeyImage: core.getInput('helm-key-image'),
    helmKeyPullSecret: core.getInput('helm-key-pullsecret'),
    helmKeyUrl: core.getInput('helm-key-url'),
    helmKeyNamespace: core.getInput('helm-key-namespace')
  };


  try {
    core.info('💊💊 Running Vendanor Kube Preview Action 💊💊');
    core.info('');
    core.info(dilbert);
    core.info('');

    if (options.cmd === 'deploy') {
        const result = await deployPreview(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment(true, options, result.previewUrl);
    } else {
      const result = await clearPreviewsForCurrentPullRequest(options);
      setOutputFromResult(result);
      // TODO: post update message?
    }
    core.info('🍺🍺🍺 GREAT SUCCESS - very nice 🍺🍺🍺');
  } catch (error) {
    await postOrUpdateGithubComment(false, options);
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
