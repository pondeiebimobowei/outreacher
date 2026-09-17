import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWorkspace } from '../../../types/express';

export const CurrentWorkspace = createParamDecorator(
  (data: keyof RequestWorkspace | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const workspace: RequestWorkspace = request.workspace;

    if (!workspace) {
      return null;
    }

    return data ? workspace[data] : workspace;
  },
);
