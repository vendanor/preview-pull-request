import * as core from '@actions/core';
import { CommandResult, Options, validateOptions } from './common';
import { removePreviewsForCurrentPullRequest } from './remove-preview';
import { deployPreview } from './deploy-preview';
import { batman } from './batman';
import { postOrUpdateGithubComment } from './sticky-comment';
import {
  addCommentReaction,
  readIsPreviewEnabledFromComment
} from './github-util';
import { context } from '@actions/github/lib/utils';
import { parseComment } from './parse-comment';
import { setFailed } from '@actions/core';

const setOutputFromResult = (result: CommandResult) => {
  if (result.previewUrl) {
    core.setOutput('preview-url', result.previewUrl);
  }
  if (result.dockerImageVersion) {
    core.setOutput('docker-image-version', result.dockerImageVersion);
  }
  if (result.helmReleaseName) {
    core.setOutput('helm-release-name', result.helmReleaseName);
  }
  core.setOutput('success', result.success);
};

const setNeutralOutput = () => {
  core.setOutput('success', true);
};

// TODO: cancellation? cleanup?
// https://docs.github.com/en/actions/managing-workflow-runs/canceling-a-workflow

async function run(): Promise<void> {
  const options: Options = {
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
    helmKeyNamespace: core.getInput('helm-key-namespace'),
    helmRemovePreviewCharts: core.getInput('helm-remove-preview-charts'),
    helmKeyTlsSecretName: core.getInput('helm-key-tls-secret-name'),
    helmKeyClusterIssuer: core.getInput('helm-key-cluster-issuer'),
    clusterIssuer: core.getInput('cluster-issuer'),
    TlsSecretName: core.getInput('tls-secret-name'),
    helmValues: core.getInput('helm-values'),
    wait: core.getInput('wait'),
    probe: core.getInput('probe')
  };

  try {
    if (options.probe.toLowerCase() === 'true') {
      core.info('👀 Running preview probe');
    } else {
      core.info('🕵 Running preview action');
    }
    core.info(batman);

    const isCommentAction = context.eventName === 'issue_comment';
    const isPullRequestAction = context.eventName === 'pull_request';
    const isPullRequestTargetAction =
      context.eventName === 'pull_request_target';
    const isBot = context.actor.toLowerCase().indexOf('bot') > -1;
    // TODO: skip ci?? Except for remove preview?
    const isPreviewEnabled = await readIsPreviewEnabledFromComment(
      options.githubToken
    );

    core.info(`isPullRequest: ${isPullRequestAction}`);
    core.info(`isPullRequestTarget: ${isPullRequestTargetAction}`);
    core.info('actor: ' + context.actor);
    core.info('isBot: ' + isBot);
    core.info('isPreviewEnabled: ' + isPreviewEnabled);
    core.info(`isComment: ${isCommentAction}`);

    core.setOutput('isBot', isBot);
    core.setOutput('isPreviewEnabled', isPreviewEnabled);
    core.setOutput('isComment', isCommentAction);

    let isValidCommand = false;

    // True if a preview will be added on this run (unless probing)
    let isAddPreviewPending: boolean;

    // True if a preview will be removed on this run (unless probing)
    const isRemovePreviewPending =
      (isPullRequestAction || isPullRequestTargetAction) &&
      context.payload.action === 'closed' &&
      isPreviewEnabled;

    if (isCommentAction) {
      const commentAction = parseComment();
      isValidCommand = !!commentAction;
      isAddPreviewPending = isCommentAction && commentAction === 'add-preview';
    } else {
      isAddPreviewPending =
        isPreviewEnabled &&
        (isPullRequestAction || isPullRequestTargetAction) &&
        context.payload.action === 'synchronize';
    }

    core.info('isValidCommand: ' + isValidCommand);
    core.info('isAddPreviewPending: ' + isAddPreviewPending);
    core.info('isRemovePreviewPending: ' + isRemovePreviewPending);
    core.setOutput('isValidCommand', isValidCommand);
    core.setOutput('isAddPreviewPending', isAddPreviewPending);
    core.setOutput('isRemovePreviewPending', isRemovePreviewPending);

    if (options.probe.toLowerCase() === 'true') {
      core.info('👀 probe done, returning');
      setNeutralOutput();
      return;
    }

    if (isCommentAction) {
      const commentAction = parseComment();

      if (commentAction === 'add-preview') {
        try {
          await addCommentReaction(options.githubToken, 'rocket');
          validateOptions(options);
          await postOrUpdateGithubComment('brewing', options);
          const result = await deployPreview(options);
          await postOrUpdateGithubComment('success', options, {
            completePreviewUrl: result.previewUrl
          });
          setOutputFromResult(result);
        } catch (err: any) {
          await postOrUpdateGithubComment('fail', options, {
            errorMessage: err.message
          });
          setFailed(err.message);
        }
      } else if (commentAction === 'remove-preview') {
        try {
          await addCommentReaction(options.githubToken, '+1');
          validateOptions(options);
          const result = await removePreviewsForCurrentPullRequest(options);
          await postOrUpdateGithubComment('removed', options);
          setOutputFromResult(result);
        } catch (err: any) {
          await postOrUpdateGithubComment('fail', options, {
            errorMessage: 'Failed to remove preview: ' + err.message
          });
          setFailed(err.message);
        }
      } else {
        core.info('No commands found in comment');
        setNeutralOutput();
      }
    } else if (isPullRequestAction || isPullRequestTargetAction) {
      // action: opened, synchronize, closed, reopened
      if (context.payload.action === 'closed') {
        if (!isPreviewEnabled) {
          core.info(
            'PR closed, no previews, nothing to remove, nothing to do, going to bed 😴'
          );
          setNeutralOutput();
          return;
        }

        try {
          validateOptions(options);
          const result = await removePreviewsForCurrentPullRequest(options);
          await postOrUpdateGithubComment('removed', options);
          setOutputFromResult(result);
        } catch (err: any) {
          await postOrUpdateGithubComment('fail', options, {
            errorMessage: err.message
          });
          setFailed(err.message);
        }
      } else if (
        context.payload.action === 'opened' ||
        context.payload.action === 'reopened'
      ) {
        core.info('opened or reopened PR, show welcome message');
        // TODO: if we close PR and reopen very quick we could get some strange results? Improve later?
        await postOrUpdateGithubComment('welcome', options);
        setNeutralOutput();
      } else if (context.payload.action === 'synchronize') {
        if (isPreviewEnabled) {
          core.info('synchronize PR, updating preview');
          try {
            validateOptions(options);
            await postOrUpdateGithubComment('brewing', options);
            const result = await deployPreview(options);
            setOutputFromResult(result);
            await postOrUpdateGithubComment('success', options, {
              completePreviewUrl: result.previewUrl
            });
          } catch (err: any) {
            await postOrUpdateGithubComment('fail', options, {
              errorMessage: err.message
            });
            setFailed(err.message);
          }
        } else {
          core.info('synchronize PR, no preview to update');
          setNeutralOutput();
        }
      } else {
        core.info('unknown pr action: ' + context.payload.action);
        setNeutralOutput();
      }
    } else {
      core.info('unknown pr event: ' + context.eventName);
      setNeutralOutput();
    }
    core.info('🍺 Done!');
  } catch (error: any) {
    await postOrUpdateGithubComment('fail', options);
    setOutputFromResult({
      success: false
    });
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
