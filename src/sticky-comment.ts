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

- Commenting \`@github-actions add-preview\` will deploy a preview
- Commenting \`@github-actions remove-preview\` will remove the preview
- The preview will be re-deployed on new commits
- The preview will be removed when the PR is closed
 
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
  const messages: { [key in MessageType]: string } = {
    welcome: `
${headerPreviewEnabled(false)}
🔮 Do you want to preview this PR? 
${commands}
    `,
    fail: `
${headerPreviewEnabled(true)}
🚨 **Preview failed!** (${sha7})

${content?.errorMessage && 'Error message:'}
${content?.errorMessage}
${commands}
  `,
    success: `
${headerPreviewEnabled(true)}
🔮 Preview (${sha7}) at <https://${content?.completePreviewUrl}>
${commands}
  `,
    removed: `
${headerPreviewEnabled(false)}
🧹 All previews are uninstalled.
  `,
    brewing: `
${headerPreviewEnabled(true)}
👷 Building preview... (${sha7})
${commands}
    `,
    cancelled: `
${headerPreviewEnabled(true)}
🚨 *Preview  cancelled!**  (${sha7})
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
