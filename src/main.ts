import * as core from '@actions/core';
import { CommandResult, Options, validateOptions } from './common';
import { removePreviewsForCurrentPullRequest } from './remove-preview';
import { deployPreview } from './deploy-preview';
import { batman } from './batman';
import { postOrUpdateGithubComment } from './sticky-comment';
import { likeTriggeringComment } from './github-util';
import { context } from '@actions/github/lib/utils';
import { parseComment } from './parseComment';

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
        await likeTriggeringComment(options.githubToken);
        const result = await deployPreview(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('success', options, result.previewUrl);
      } else if (commentAction === 'remove') {
        await likeTriggeringComment(options.githubToken);
        const result = await removePreviewsForCurrentPullRequest(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('removed', options);
      }
    } else if (isPullRequestAction || isPullRequestTargetAction) {
      // action: opened, synchronize, closed, reopened
      if (context.action === 'closed') {
        // TODO: add comment "Closing"?
        const result = await removePreviewsForCurrentPullRequest(options);
        setOutputFromResult(result);
        await postOrUpdateGithubComment('removed', options);
      } else if (
        context.action === 'opened' ||
        context.action === 'reopened' ||
        context.action === 'synchronize'
      ) {
        await postOrUpdateGithubComment('welcome', options);
      } else {
        core.info('unknown pr action: ' + context.action);
      }
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
