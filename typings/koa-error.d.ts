/* tslint:disable */
declare module "koa-error" {

  import * as Koa from "koa";

  interface Options {
    template?: string;
    engine?: string;
    cache?: boolean;
    env?: string;
    accepts?: string[];
  }

  declare function error(options?: Options): Koa.Middleware;

  export = error;
}
/* tslint:enable */
