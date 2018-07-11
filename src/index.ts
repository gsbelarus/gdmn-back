import config from "config";
import http, {Server as HttpServer} from "http";
import Koa from "koa";
import bodyParser from "koa-bodyParser";
import errorHandler from "koa-error";
import logger from "koa-logger";
import Router from "koa-router";
import serve from "koa-static";
import cors from "koa2-cors";
import {ApplicationManager} from "./ApplicationManager";
import {checkHandledError, ErrorCodes, throwCtx} from "./ErrorCodes";
import passport from "./passport";
import account from "./router/account";
import app from "./router/app";
import Application = require("koa");

interface IServer {
  appManager: ApplicationManager;
  httpServer?: HttpServer;
}

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function create(): Promise<IServer> {
  const appManager = new ApplicationManager();
  await appManager.create();

  const serverApp = new Koa()
    .use(logger())
    .use(serve(config.get("server.publicDir")))
    .use(bodyParser())
    .use(passport.initialize())
    .use(cors())
    .use(errorHandler())
    .use(async (ctx, next) => {
      try {
        await next();
      } catch (error) {
        if (checkHandledError(error)) {
          throw error;
        }
        throwCtx(ctx, 500, error, ErrorCodes.INTERNAL);
      }
    });

  serverApp.use(async (ctx, next) => {
    ctx.state.appManager = appManager;
    await next();
  });

  const router = new Router()
    .use("/account", account.routes(), account.allowedMethods())
    .use("/app", passport.authenticate("jwt"), app.routes(), app.allowedMethods());

  serverApp
    .use(router.routes())
    .use(router.allowedMethods())
    .use((ctx) => throwCtx(ctx, 404, "Not found", ErrorCodes.NOT_FOUND, ["route"]));

  return {
    appManager,
    httpServer: startHttpServer(serverApp)
  };
}

function startHttpServer(serverApp: Application): HttpServer | undefined {
  let httpServer: HttpServer | undefined;
  if (config.get("server.http.enabled")) {
    httpServer = http.createServer(serverApp.callback());
    httpServer.listen(config.get("server.http.port"), config.get("server.http.host"));
    httpServer.on("error", serverErrorHandler);
    httpServer.on("listening", () => {
      console.log(`Listening on http://${httpServer!.address().address}:${httpServer!.address().port};` +
        ` env: ${process.env.NODE_ENV}`);
    });
  }
  return httpServer;
}

const creating = create();

process.on("SIGINT", exit);
process.on("SIGTERM", exit);

async function exit(): Promise<void> {
  try {
    const {appManager, httpServer} = await creating;

    if (httpServer) {
      httpServer.removeAllListeners();
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await appManager.destroy();

  } catch (error) {
    switch (error.message) {
      case "connection shutdown":
        // ignore
        break;
      default:
        console.error(error);
    }
  } finally {
    console.log("Application destroyed");
    process.exit();
  }
}

function serverErrorHandler(error: NodeJS.ErrnoException): void {
  if (error.syscall !== "listen") {
    throw error;
  }
  switch (error.code) {
    case "EACCES":
      console.error("Port requires elevated privileges");
      process.exit();
      break;
    case "EADDRINUSE":
      console.error("Port is already in use");
      process.exit();
      break;
    default:
      throw error;
  }
}
