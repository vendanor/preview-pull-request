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
    wait: core.getInput('wait')
  };

  try {
    core.info('🕵 Running preview action 🕵️');
    core.info(batman);

    const isCommentAction = context.eventName === 'issue_comment';
    const isPullRequestAction = context.eventName === 'pull_request';
    const isPullRequestTargetAction =
      context.eventName === 'pull_request_target';
    const isBot = context.actor.toLowerCase().indexOf('bot') > -1;
    // TODO: skip ci?? Except for remove preview?

    core.info(`isComment: ${isCommentAction}`);
    core.info(`isPullRequest: ${isPullRequestAction}`);
    core.info(`isPullRequestTarget: ${isPullRequestTargetAction}`);
    core.info('actor: ' + context.actor);
    core.info('isBot: ' + isBot);

    // Debug:
    // const temp = JSON.stringify(context, null, 2);
    // core.info(temp);

    validateOptions(options);

    if (isCommentAction) {
      const commentAction = parseComment();
      if (commentAction === 'add-preview') {
        try {
          await addCommentReaction(options.githubToken, 'rocket');
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
      const isPreviewEnabled = await readIsPreviewEnabledFromComment(
        options.githubToken
      );
      core.info('isPreviewEnabled: ' + isPreviewEnabled);

      // action: opened, synchronize, closed, reopened
      if (context.action === 'closed' && isPreviewEnabled) {
        try {
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
      }
    } else {
      core.info('unknown pr action: ' + context.payload.action);
      setNeutralOutput();
    }

    // TODO: How to listen for cancelled? will it be catched?

    // if (options.cmd === 'deploy') {
    //
    //   const result = await deployPreview(options);
    //   setOutputFromResult(result);
    //   await postOrUpdateGithubComment('success', options, result.previewUrl);
    // } else if (options.cmd.startsWith('notify')) {
    //   const pullRequestId = await getCurrentPullRequestId(options.githubToken);
    //   const hash = generateHash(pullRequestId, options.hashSalt);
    //   const previewUrlIdentifier = `${options.appName}-${pullRequestId}-${hash}`;
    //   const completePreviewUrl = `${previewUrlIdentifier}.${options.baseUrl}`;
    //
    //   let messageType: MessageType = 'welcome';
    //   // if (options.cmd === 'notify-start') {
    //   //   messageType = 'brewing';
    //   // } else if (options.cmd === 'notify-cancelled') {
    //   //   messageType = 'cancelled';
    //   // } else if (options.cmd === 'notify-failed') {
    //   //   messageType = 'fail';
    //   // }
    //
    //   await postOrUpdateGithubComment(messageType, options, completePreviewUrl);
    //   setOutputFromResult({
    //     success: true
    //   });
    // } else if (options.cmd === 'remove') {
    //   const result = await removePreviewsForCurrentPullRequest(options);
    //   setOutputFromResult(result);
    //   await postOrUpdateGithubComment('removed', options);
    // } else {
    //   throw new Error(`Command ${options.cmd} not supported`);
    // }

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
