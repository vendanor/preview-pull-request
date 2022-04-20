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
import { parseComment } from './parseComment';
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
    core.info('🕵️ Running Vendanor Kube Preview Action 🕵️');
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
    core.info('action' + context.action);
    core.info('actor' + context.actor);
    core.info('workflow' + context.workflow);
    core.info('isBot' + isBot);
    const temp = JSON.stringify(context, null, 2);
    core.info(temp);

    validateOptions(options);

    if (isCommentAction) {
      const commentAction = parseComment();
      if (commentAction === 'add') {
        await addCommentReaction(options.githubToken, 'rocket');
        const result = await deployPreview(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('success', options, result.previewUrl);
      } else if (commentAction === 'remove') {
        await addCommentReaction(options.githubToken, '+1');
        const result = await removePreviewsForCurrentPullRequest(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('removed', options);
      }
    } else if (isPullRequestAction || isPullRequestTargetAction) {
      // action: opened, synchronize, closed, reopened
      // synchronize: Triggered when a pull request's head branch is updated.
      // For example, when the head branch is updated from the base branch,
      // when new commits are pushed to the head branch, or when the
      // base branch is changed.

      const isPreviewEnabled = await readIsPreviewEnabledFromComment(
        options.githubToken
      );
      core.info('isPreviewEnabled: ' + isPreviewEnabled);

      if (context.action === 'closed' && isPreviewEnabled) {
        // TODO: add NEW comment "Closing"?
        core.info('closed...');
        const result = await removePreviewsForCurrentPullRequest(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('removed', options);
      } else if (
        context.payload.action === 'opened' ||
        context.payload.action === 'reopened'
      ) {
        core.info('opened or reopened, show welcome...');
        if (isPreviewEnabled) {
          // TODO: if we close and reopen, welcome message will show...
          await postOrUpdateGithubComment('welcome', options);
        } else {
          await postOrUpdateGithubComment('welcome', options);
        }
      }
    } else if (context.payload.action === 'synchronize') {
      core.info('sync (preview enabled)...');
      // TODO: comment in progress?
      try {
        await postOrUpdateGithubComment('brewing', options);
        const result = await deployPreview(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('success', options, result.previewUrl);
      } catch (err) {
        core.info('failed here test?');
        await postOrUpdateGithubComment('fail', options);
        setFailed('Failed to deploy new preview');
      }
    } else {
      core.info('unknown pr action: ' + context.payload.action);

      //
    }

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
