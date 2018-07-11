import Router from "koa-router";
import {ApplicationManager} from "../ApplicationManager";
import {assertCtx, ErrorCodes, throwCtx} from "../ErrorCodes";
import passport, {createJwtToken} from "../passport";

function isAuthExists(obj: any): obj is { login: string, password: string } {
  return obj && obj.login && obj.password;
}

export default new Router()
  .post("/", async (ctx) => {
    if (isAuthExists(ctx.request.body)) {
      const appManager = ctx.state.appManager as ApplicationManager;
      const duplicate = await appManager.mainApplication!.findUser({login: ctx.request.body.login});
      assertCtx(!duplicate, ctx, 400, "Login already exists", ErrorCodes.NOT_UNIQUE, ["login"]);

      const user = await appManager.mainApplication!.addUser({
        login: ctx.request.body.login,
        password: ctx.request.body.password,
        admin: false
      });
      return ctx.body = {token: createJwtToken(user)};
    }
    throwCtx(ctx, 400, "Login or password is not provided", ErrorCodes.INVALID_ARGUMENTS, ["login", "password"]);
  })
  .post("/login", passport.authenticate("local"), (ctx) => {
    return ctx.body = {token: createJwtToken(ctx.state.user)};
  });
