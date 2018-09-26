import fs from "fs";
import {IEntityQueryInspector} from "gdmn-orm";
import Router from "koa-router";
import {Application} from "../apps/Application";
import {MainApplication} from "../apps/MainApplication";
import {SessionManager} from "../apps/SessionManager";
import databases from "../db/databases";
import {ErrorCodes, throwCtx} from "../ErrorCodes";

function isMainApplicationExists(obj: any): obj is { mainApplication: MainApplication } {
  return obj && obj.mainApplication && obj.mainApplication instanceof MainApplication;
}

// function isAliasExists(obj: any): obj is { alias: string } {
//   return obj && obj.alias;
// }

function isQueryExists(obj: any): obj is { query: IEntityQueryInspector } {
  return obj && obj.query;
}

export default new Router()
  .use(async (ctx, next) => {
    if (!isMainApplicationExists(ctx.state)) {
      throwCtx(ctx, 500, "ApplicationManager not found", ErrorCodes.INTERNAL);
    }
    return await next();
  })
  // .post("/", async (ctx) => {
  //   if (!isAliasExists(ctx.request.body)) {
  //     throwCtx(ctx, 400, "Alias is not provided", ErrorCodes.INVALID_ARGUMENTS, ["alias"]);
  //   }
  //   const mainApplication = ctx.state.mainApplication as MainApplication;
  //   const result = await mainApplication.add(ctx.state.user.id, ctx.request.body.alias);
  //   return ctx.body = result;
  // })
  .get("/", async (ctx) => {
    const mainApplication = ctx.state.mainApplication as MainApplication;
    const apps = await mainApplication.getApplicationsInfo(ctx.state.user.id);
    return ctx.body = apps.map((appInfo) => {
      if (!databases.test || databases.test.alias !== appInfo.alias) {
        const appPath = MainApplication.getAppPath(appInfo.uid);
        const size = fs.statSync(appPath).size;
        return {...appInfo, size};
      }
      return appInfo;
    });
  })
  .use("/:uid", async (ctx, next) => {
    const mainApplication = ctx.state.mainApplication as MainApplication;
    const sessionManager = new SessionManager(mainApplication.connectionPool);
    const session = await sessionManager.open(ctx.state.user.id);
    session.borrow();
    try {
      ctx.state.application = mainApplication.getApplication(ctx.params.uid, session);
      if (!ctx.state.application.connected) {
        await ctx.state.application.connect();
      }
      if (!ctx.state.application) {
        throwCtx(ctx, 404, "Application not found", ErrorCodes.NOT_FOUND);
      }
      await next();
    } finally {
      session.release();
      await session.close();
    }
  })
  // .delete("/:uid", async (ctx) => {
  //   const mainApplication = ctx.state.mainApplication as MainApplication;
  //   await mainApplication.delete(ctx.state.user.id, ctx.params.uid);
  //   return ctx.body = {uid: ctx.params.uid};
  // })
  .get("/:uid/er", async (ctx) => {
    const application = ctx.state.application as Application;
    return ctx.body = JSON.stringify(application.erModel.serialize());
  })
  .post("/:uid/data", async (ctx) => {
    if (!isQueryExists(ctx.request.body)) {
      throwCtx(ctx, 400, "Query is not provided", ErrorCodes.INVALID_ARGUMENTS, ["query"]);
    }
    const application = ctx.state.application as Application;
    return ctx.body = await application.query(ctx.request.body.query);
  });
