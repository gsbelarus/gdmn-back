import {Context} from "koa";

export enum ErrorCodes {
  INTERNAL,
  NOT_FOUND,
  INVALID_AUTH_TOKEN,
  INVALID_ARGUMENTS
}

export function throwCtx(ctx: Context,
                         status: number = 500,
                         message?: string | Error,
                         code: ErrorCodes = ErrorCodes.INTERNAL,
                         tokens: string[] = []): never {
  throw ctx.throw(status, message || "", {code, tokens});
}
