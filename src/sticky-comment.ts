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

type MessageType = 'success' | 'fail' | 'removed' | 'brewing';

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
  const img = 'http://files.vendanor.com/images/vn-preview-495kfd53sl4.png';
  const messages: { [key in MessageType]: string } = {
    fail: `
![vn](${img} "vn")
🚨🚨 Preview :: Last job failed! 🚨🚨
Your preview (${sha7}) is (not yet) available.
  `,
    success: `
![vn](${img} "vn")
Your preview (${sha7}) is available here:
<https://${completePreviewUrl}>
  `,
    removed: `
![vn](${img} "vn")
All previews are uninstalled from Kubernetes.  
Please re-open PR and commit one change if you want to generate a new preview.
  `,
    brewing: `
![vn](${img} "vn")
Your preview is available here:
<https://${completePreviewUrl}>

👷 A new version (${sha7}) is currently building..
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
