import {Context} from "koa";

export enum ErrorCodes {
  INTERNAL,
  NOT_FOUND,
  NOT_UNIQUE,
  INVALID_AUTH_TOKEN,
  INVALID_ARGUMENTS
}

export function checkHandledError(error: any): boolean {
  return error.code && error.fields;
}

export function throwCtx(ctx: Context, status: number, error?: Error, code?: ErrorCodes, fields?: string[]): never;
export function throwCtx(ctx: Context, status: number, message?: string, code?: ErrorCodes, fields?: string[]): never;
export function throwCtx(ctx: Context,
                         status: number = 500,
                         source: string | Error = "",
                         code: ErrorCodes = ErrorCodes.INTERNAL,
                         fields: string[] = []): never {
  if (typeof source === "string") {
    ctx.throw(status, new Error(source || ""), {message: source, code, fields});
  } else if (source instanceof Error) {
    ctx.throw(status, source, {message: source.message, code, fields});
  }
  throw new Error("never thrown");
}

export function assertCtx(value: any,
                          ctx: Context,
                          status: number = 500,
                          message: string = "",
                          code: ErrorCodes = ErrorCodes.INTERNAL,
                          fields: string[] = []): void {
  ctx.assert(value, status, new Error(message) as any, {status, code, fields});
}
