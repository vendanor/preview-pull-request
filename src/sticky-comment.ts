import * as core from '@actions/core';
import {
  createComment,
  findPreviousComment,
  getCurrentContext, getCurrentPullRequestId,
  getLatestCommitShortSha,
  updateComment
} from './github-util';
import { Options } from './common';

export async function postOrUpdateGithubComment(
  success: boolean,
  options: Options,
  completePreviewUrl?: string,
) {
  // === Post comment with preview url to Pull Request ===
  const header = `=== VnKubePreview ===`;
  const context = await getCurrentContext();
  const sha7 = await getLatestCommitShortSha(options.githubToken);
  const pullRequestId = await getCurrentPullRequestId(options.githubToken);

  core.info('Posting message to github PR...');

  const body = success
    ? `
        ![vn](https://app.vendanor.com/img/favicon/android-chrome-192x192.png "vn")
        ## 🔥🔥 Preview :: Great success! 🔥🔥
        Your preview (${sha7}) is available here:
        <https://${completePreviewUrl}>
      `
    : `
        ![vn](https://app.vendanor.com/img/favicon/android-chrome-192x192.png "vn")
        ## 🚨🚨 Preview :: Last job failed! 🚨🚨
        Your preview (${sha7}) is (not yet) available here:
        <https://${completePreviewUrl}>
      `;

  const previousComment = await findPreviousComment(
    options.githubToken,
    context.repo,
    pullRequestId,
    header
  );

  if (previousComment) {
    await updateComment(
      options.githubToken,
      context.repo,
      previousComment.id,
      body,
      header
    );
  } else {
    await createComment(
      options.githubToken,
      context.repo,
      pullRequestId,
      body,
      header
    );
  }

  core.info('Message posted in PR!');
}
