import Router from "koa-router";
import {ApplicationManager} from "../ApplicationManager";
import {assertCtx, ErrorCodes, throwCtx} from "../ErrorCodes";
import passport, {createAccessJwtToken, createRefreshJwtToken} from "../passport";

function isAuthExists(obj: any): obj is { login: string, password: string } {
  return obj && obj.login && obj.password;
}

export default new Router()
  .post("/", async (ctx) => {
    if (isAuthExists(ctx.request.body)) {
      const appManager = ctx.state.appManager as ApplicationManager;
      const duplicate = await appManager.mainApplication!.findUser({login: ctx.request.body.login});
      assertCtx(!duplicate, ctx, 401, "Login already exists", ErrorCodes.NOT_UNIQUE, ["login"]);

      const user = await appManager.mainApplication!.addUser({
        login: ctx.request.body.login,
        password: ctx.request.body.password,
        admin: false
      });
      return ctx.body = {
        access_token: createAccessJwtToken(user),
        refresh_token: createRefreshJwtToken(user),
        token_type: "Bearer"
      };
    }
    throwCtx(ctx, 400, "Login or password is not provided", ErrorCodes.INVALID_ARGUMENTS);
  })
  .post("/login", passport.authenticate("local"), (ctx) => {
    return ctx.body = {
      access_token: createAccessJwtToken(ctx.state.user),
      refresh_token: createRefreshJwtToken(ctx.state.user),
      token_type: "Bearer"
    };
  })
  .post("/refresh", passport.authenticate("refresh_jwt"), async (ctx) => {
    return ctx.body = {
      access_token: createAccessJwtToken(ctx.state.user),
      refresh_token: createRefreshJwtToken(ctx.state.user),
      token_type: "Bearer"
    };
  });
