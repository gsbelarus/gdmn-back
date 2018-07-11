import {IEntityQueryInspector} from "gdmn-orm";
import Router from "koa-router";
import {ApplicationManager} from "../ApplicationManager";
import {Application} from "../context/Application";
import {ErrorCodes, throwCtx} from "../ErrorCodes";

function isAppManagerExists(obj: any): obj is { appManager: ApplicationManager } {
  return obj && obj.appManager && obj.appManager instanceof ApplicationManager;
}

function isAliasExists(obj: any): obj is { alias: string } {
  return obj && obj.alias;
}

function isQueryExists(obj: any): obj is { query: IEntityQueryInspector } {
  return obj && obj.query;
}

export default new Router()
  .use(async (ctx, next) => {
    if (!isAppManagerExists(ctx.state)) {
      throwCtx(ctx, 500, "ApplicationManager not found", ErrorCodes.INTERNAL);
    }
    return await next();
  })
  .post("/", async (ctx) => {
    if (isAliasExists(ctx.request.body)) {
      const appManager = ctx.state.appManager as ApplicationManager;
      const uid = await appManager.add(ctx.state.user.id, ctx.request.body.alias);
      return ctx.body = {uid};
    }
    throwCtx(ctx, 400, "Alias is not provided", ErrorCodes.INVALID_ARGUMENTS, ["alias"]);
  })
  .get("/", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    return ctx.body = await appManager.getAll(ctx.state.user.id);
  })
  .use("/:uid", async (ctx, next) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    ctx.state.application = await appManager.get(ctx.state.user.id, ctx.params.uid);
    if (!ctx.state.application) {
      throwCtx(ctx, 400, "Invalid application uid", ErrorCodes.INVALID_ARGUMENTS, ["uid"]);
    }
    await next();
  })
  .delete("/:uid", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    await appManager.delete(ctx.state.user.id, ctx.params.uid);
    return ctx.body = {uid: ctx.params.uid};
  })
  .get("/:uid/er", async (ctx) => {
    const application = ctx.state.application as Application;
    return ctx.body = JSON.stringify(application.erModel.serialize());
  })
  .post("/:uid/data", async (ctx) => {
    if (isQueryExists(ctx.request.body)) {
      const application = ctx.state.application as Application;
      return ctx.body = await application.query(ctx.request.body.query);
    }
    throwCtx(ctx, 400, "Query is not provided", ErrorCodes.INVALID_ARGUMENTS, ["query"]);
  });
