import { CommandResult, HelmListResult, Options } from './common';
import * as core from '@actions/core';
import { runCmd } from './run-cmd';
import { getCurrentPullRequestId } from './github-util';

export const clearPreviewsForCurrentPullRequest = async (
  options: Options
): Promise<CommandResult> => {
  const pullRequestId = await getCurrentPullRequestId(options.githubToken);
  core.info(`Removing previews for pull request ${pullRequestId}...`);
  const cmdResult = await runCmd('helm', ['list', '--namespace', options.helmNamespace, '--filter', `preview-${options.appName}-${pullRequestId}`, '--output', 'json'])
  core.info('Helm list result: ' + cmdResult.resultCode);
  core.info(cmdResult.output);
  const json = JSON.parse(cmdResult.output) as HelmListResult;

  for (let index = 0; index < json.length; index++) {
    const release = json[index];
    core.info(`Removing release ${release.name} (${release.app_version})`);
    const removeResult = await runCmd('helm', ['uninstall', release.name, '--namespace', options.helmNamespace])
    if (removeResult.resultCode === 0) {
      core.info(removeResult.output);
    } else {
      core.error(removeResult.output);
    }
  }

  core.info(`All previews for app ${options.appName} deleted successfully!`);

  return {
    success: true
  };
};
