import * as core from '@actions/core';
import {
  createComment,
  findPreviousComment,
  getCurrentContext,
  getCurrentPullRequestId,
  getLatestCommitShortSha,
  updateComment
} from './github-util';
import { Options } from './common';

type MessageType = 'success' | 'fail' | 'removed';

export async function postOrUpdateGithubComment(
  type: MessageType,
  options: Options,
  completePreviewUrl?: string
) {
  const header = `VnKubePreview`;
  const context = await getCurrentContext();
  const sha7 = await getLatestCommitShortSha(options.githubToken);
  const pullRequestId = await getCurrentPullRequestId(options.githubToken);

  core.info('Posting message to github PR...');
  const img = 'http://files.vendanor.com/images/preview-78fe47dj.png';
  const messages: { [key in MessageType]: string } = {
    fail: `
## 🚨🚨 Preview :: Last job failed! 🚨🚨
![vn](${img} "vn")
Your preview (${sha7}) is (not yet) available.
  `,
    success: `
## 🔥🔥 Preview :: Great success! 🔥🔥
![vn](${img} "vn")
Your preview (${sha7}) is available here:
<https://${completePreviewUrl}>
  `,
    removed: `
## 🗑️🗑️ Preview :: Removed 🗑️🗑️
All previews are uninstalled from Kubernetes.  
Re-open PR if you want to regenerate a new preview.
  `
  };
  const body = messages[type];

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
