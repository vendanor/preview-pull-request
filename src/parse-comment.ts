import * as core from '@actions/core';
import { context } from '@actions/github/lib/utils';

const commentPrefix = '@github-action';

type CommentAction = 'add-preview' | 'remove-preview';

export const parseComment = (): CommentAction | undefined => {
  const comment: string = (context.payload as any).comment.body;
  if (!comment.toLowerCase().startsWith(commentPrefix)) {
    core.info(`HINT: Preview comments must start with ${commentPrefix}`);
    core.info(comment);
    return;
  } else {
    const action = comment.replace(commentPrefix, '').trim();
    if (action === 'add-preview' || action === 'remove-preview') {
      return action;
    } else {
      core.info(`HINT: Unknown command ${action}`);
    }
  }
};
