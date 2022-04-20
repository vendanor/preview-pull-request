import {
  ChartListResult,
  CommandResult,
  HelmListResult,
  Options,
  PREVIEW_TAG_PREFIX,
  validateOptions
} from './common';
import * as core from '@actions/core';
import { runCmd } from './run-cmd';
import { getCurrentPullRequestId } from './github-util';
import axios from 'axios';

export const removePreviewsForCurrentPullRequest = async (
  options: Options
): Promise<CommandResult> => {
  const {
    appName,
    githubToken,
    helmNamespace,
    helmRemovePreviewCharts,
    helmRepoPassword,
    helmRepoUrl,
    helmRepoUsername
  } = options;

  const pullRequestId = await getCurrentPullRequestId(githubToken);
  const shouldRemoveCharts: boolean =
    helmRemovePreviewCharts.toLowerCase() === 'true';
  const regexCurrentVersion = new RegExp(
    `\\b${PREVIEW_TAG_PREFIX}.${pullRequestId}.\\b`
  );

  core.info(`Removing previews for pull request ${pullRequestId}...`);
  const cmdResult = await runCmd('helm', [
    'list',
    '--namespace',
    helmNamespace,
    '--filter',
    `preview-${appName}-${pullRequestId}`,
    '--output',
    'json'
  ]);
  core.info('Helm list result: ' + cmdResult.resultCode);
  core.info(cmdResult.output);
  const json = JSON.parse(cmdResult.output) as HelmListResult;

  for (let index = 0; index < json.length; index++) {
    const release = json[index];
    core.info(
      `Removing release ${release.name} (${release.app_version}) from Kubernetes`
    );
    const removeResult = await runCmd('helm', [
      'uninstall',
      release.name,
      '--namespace',
      helmNamespace
    ]);
    if (removeResult.resultCode === 0) {
      core.info(removeResult.output);
    } else {
      core.error(removeResult.output);
    }
  }

  if (shouldRemoveCharts) {
    core.info('Removing charts..');

    const url = `${helmRepoUrl}/api/charts/${appName}`;
    core.info('Get a list of all charts for app, url: ' + url);
    const allCharts = await axios.get<ChartListResult>(url, {
      auth: {
        username: helmRepoUsername,
        password: helmRepoPassword
      },
      responseType: 'json'
    });
    core.info(
      `Fetch list of charts: ${allCharts.status} - ${allCharts.statusText}`
    );

    // core.info('All charts');
    // core.info(JSON.stringify(allCharts.data, null, 2));

    const filteredCharts = allCharts.data.filter(
      c => c.name === appName && regexCurrentVersion.test(c.version)
    );

    // core.info('filtered charts to delete');
    // core.info(JSON.stringify(filteredCharts, null, 2));
    core.info(`Found ${filteredCharts.length} preview charts to delete`);

    for (let i = 0; i < filteredCharts.length; i++) {
      const { name, version } = filteredCharts[i];
      core.info(`Deleting chart ${version}`);
      const deleteResult = await axios.delete(
        `${helmRepoUrl}/api/charts/${name}/${version}`,
        {
          auth: {
            username: helmRepoUsername,
            password: helmRepoPassword
          },
          responseType: 'json'
        }
      );
      core.info(
        `Delete result: ${deleteResult.status} ${deleteResult.statusText}`
      );
    }

    core.info('Done deleting helm charts');
  } else {
    core.info('Skip removing charts..');
  }

  core.info(`All previews for app ${appName} deleted successfully!`);

  return {
    success: true
  };
};
