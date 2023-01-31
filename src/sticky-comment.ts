import * as core from '@actions/core';
import {
  createComment,
  findPreviousComment,
  getCurrentContext,
  getCurrentPullRequestId,
  getLatestCommitShortSha,
  updateComment
} from './github-util';
import { headerPreviewEnabled, Options, stickyHeaderKey } from './common';

export type MessageType =
  | 'welcome'
  | 'success'
  | 'fail'
  | 'removed'
  | 'brewing'
  | 'cancelled';

const commands = `

You can trigger preview-pull-request by commenting on this PR:  
- \`@github-actions add-preview\` will deploy a preview 
- \`@github-actions remove-preview\` will remove a preview
- preview will be updated on new commits to PR
- preview will be removed when the PR is closed
 
`;

export async function postOrUpdateGithubComment(
  type: MessageType,
  options: Options,
  content?: {
    completePreviewUrl?: string;
    errorMessage?: string;
  }
) {
  const context = await getCurrentContext();
  const sha7 = await getLatestCommitShortSha(options.githubToken);
  const pullRequestId = await getCurrentPullRequestId(options.githubToken);

  core.info('Posting message to github PR: ' + type);
  const img =
    'https://github.com/vendanor/preview-pull-request/blob/main/logo.png?raw=true';
  const messages: { [key in MessageType]: string } = {
    welcome: `
${headerPreviewEnabled(false)}
![vn](${img} "vn")
👷 Hello! Do you want to preview your stuff? 
${commands}
    `,
    fail: `
${headerPreviewEnabled(true)}
![vn](${img} "vn")
🚨🚨 Preview :: Last job failed! 🚨🚨

${content?.errorMessage && 'Error message:'}
${content?.errorMessage}

Your preview (${sha7}) is (not yet) available.
${commands}
  `,
    success: `
${headerPreviewEnabled(true)}
![vn](${img} "vn")
Your preview (${sha7}) is available here:
<https://${content?.completePreviewUrl}>
${commands}
  `,
    removed: `
${headerPreviewEnabled(false)}
![vn](${img} "vn")
All previews are uninstalled from Kubernetes.  
${commands}
  `,
    brewing: `
${headerPreviewEnabled(true)}
![vn](${img} "vn")

👷 A new version (${sha7}) is currently building..
${commands}
    `,
    cancelled: `
${headerPreviewEnabled(true)}
![vn](${img} "vn")
🚨🚨 Preview :: Last job cancelled 🚨🚨
Your preview (${sha7}) is (not yet) available.    
${commands}
    `
  };
  const body = messages[type];

  const previousComment = await findPreviousComment(
    options.githubToken,
    context.repo,
    pullRequestId,
    stickyHeaderKey
  );

  if (previousComment) {
    await updateComment(
      options.githubToken,
      context.repo,
      previousComment.id,
      body,
      stickyHeaderKey
    );
  } else {
    await createComment(
      options.githubToken,
      context.repo,
      pullRequestId,
      body,
      stickyHeaderKey
    );
  }

  core.info('Message posted in PR!');
}
