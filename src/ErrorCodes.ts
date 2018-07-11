import {Context} from "koa";

export enum ErrorCodes {
  INTERNAL,
  NOT_FOUND,
  NOT_UNIQUE,
  INVALID_AUTH_TOKEN,
  INVALID_ARGUMENTS
}

export function checkHandledError(error: any): boolean {
  return error.code && error.tokens;
}

export function throwCtx(ctx: Context,
                         status: number = 500,
                         message?: string | Error,
                         code: ErrorCodes = ErrorCodes.INTERNAL,
                         tokens: string[] = []): never {
  ctx.throw(status, message || "", {code, tokens});
  throw new Error("throwCtx");
}

export function assertCtx(value: any,
                          ctx: Context,
                          status: number = 500,
                          message: string = "",
                          code: ErrorCodes = ErrorCodes.INTERNAL,
                          tokens: string[] = []): void {
  ctx.assert(value, status, message, {code, tokens});
}
