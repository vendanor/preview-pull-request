import * as core from '@actions/core';
import { context } from '@actions/github/lib/utils';

const commentPrefix = '@preview';

type CommentAction = 'add' | 'remove';

export const parseComment = (): CommentAction | undefined => {
  const comment: string = (context.payload as any).comment.body;
  if (!comment.startsWith(commentPrefix)) {
    core.info(`HINT: Preview comments must start with ${commentPrefix}`);
    return;
  } else {
    const action = comment.replace(commentPrefix, '').trim();
    if (action === 'add' || action === 'remove') {
      return action;
    } else {
      core.info(`HINT: Unknown command ${action}`);
    }
  }
};
