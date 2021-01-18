import * as core from '@actions/core';
import { CommandResult, Options } from './common';
import { clearPreviewsForCurrentPullRequest } from './clear-preview';
import { deployPreview } from './deploy-preview';

const setOutputFromResult = (result: CommandResult) => {
  core.setOutput("preview-url", result.previewUrl);
  core.setOutput("docker-image-version", result.dockerImageVersion);
  core.setOutput("helm-release-version", result.helmReleaseName);
};

async function run(): Promise<void> {
  try {
    core.info('💊💊 Running Vendanor Kube Preview Action 💊💊');
    const options: Options = {
      cmd: core.getInput('command', { required: true }),
      appName: core.getInput('app-name'),
      helmNamespace: core.getInput('helm-namespace', { required: true }),
      githubToken: core.getInput('token', { required: true }),
      dockerImageName: core.getInput('docker-image-name', { required: true }),
      dockerRegistry: core.getInput('docker-registry', { required: true} ),
      dockerOrganization: core.getInput('docker-organization', { required: true }),
      dockerTagMajor: core.getInput('docker-tag-major', { required: true }),
      dockerFile: core.getInput('docker-file', { required: true }),
      dockerUsername: core.getInput('docker-username', {required: true }),
      dockerPassword: core.getInput('docker-password', {required: true }),
      dockerPullSecret: core.getInput('docker-pullsecret', {required: true}),
      hashSalt: core.getInput('hash-salt', { required: true }),
      helmTagMajor: core.getInput('helm-tag-major', {required: true}),
      helmChartFilename: core.getInput('helm-chart', {required: true}),
      helmRepoUrl: core.getInput('helm-repo-url'),
      helmOrganization: core.getInput('helm-organization', { required: true}),
      azureToken: core.getInput('azure-token', {required: true}),
      baseUrl: core.getInput('base-url', {required: true})
    };

    if (options.cmd === 'deploy') {
      const result = await deployPreview(options);
      setOutputFromResult(result);
    } else {
      const result = await clearPreviewsForCurrentPullRequest(options);
      setOutputFromResult(result);
    }
    core.info('🍺🍺🍺 GREAT SUCCESS - very nice 🍺🍺🍺');
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
