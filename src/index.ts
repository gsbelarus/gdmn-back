import config from "config";
import http, {Server as HttpServer} from "http";
import Koa from "koa";
import koaBody from "koa-body";
import errorHandler from "koa-error";
import logger from "koa-logger";
import Router from "koa-router";
import send from "koa-send";
import serve from "koa-static";
import cors from "koa2-cors";
import path from "path";
import io, {Socket} from "socket.io";
import {ApplicationManager} from "./ApplicationManager";
import {checkHandledError, ErrorCodes, throwCtx} from "./ErrorCodes";
import passport, {getAuthMiddleware, getPayloadFromJwtToken} from "./passport";
import account from "./router/account";
import app from "./router/app";

interface IServer {
  appManager: ApplicationManager;
  httpServer?: HttpServer;
  sio: io.Server;
}

process.env.NODE_ENV = process.env.NODE_ENV || "development";

async function create(): Promise<IServer> {
  const appManager = new ApplicationManager();
  await appManager.create();

  const serverApp = new Koa()
    .use(logger())
    .use(serve(config.get("server.publicDir")))
    .use(koaBody({multipart: true}))
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

  const usersToSockets = new Map<number, Socket>();

  const extractSocket = async (ctx: Router.IRouterContext, next: () => Promise<any>) => {
    const userId = ctx.state.user.id;
    ctx.state.socket = usersToSockets.get(userId);
    await next();
  };

  const router = new Router()
    .use("/account", account.routes(), account.allowedMethods())
    .use("/app", getAuthMiddleware("jwt", passport), extractSocket, app.routes(), app.allowedMethods())

    // TODO temp
    .get("/", (ctx) => ctx.redirect("/spa"))
    .get(/\/spa(\/*)?/g, async (ctx) => {
      console.log(path.resolve(process.cwd(), config.get("server.publicDir")));
      await send(ctx, "/gs/ng/", {
        root: path.resolve(process.cwd(), config.get("server.publicDir")),
        index: "index",
        extensions: ["html"]
      });
    });

  serverApp
    .use(router.routes())
    .use(router.allowedMethods())
    .use((ctx) => throwCtx(ctx, 404, "Not found", ErrorCodes.NOT_FOUND));

  const httpServer = startHttpServer(serverApp);

  const sio = io(httpServer);

  sio.use((socket: Socket, next) => {
    const token = socket.handshake.query.token;
    try {
      const payload = getPayloadFromJwtToken(token);
      const userId = payload.id;
      usersToSockets.set(userId, socket);
      next();
    } catch (error) {
      next(error);
    }
  });

  sio.on("connection", (socket: Socket) => {
    socket.on("disconnect", async () => {
      const sockets = Array.from(usersToSockets.entries());
      const pair = sockets.find(([_, s]) => socket.id === s.id);
      if (!pair) {
        throw new Error("Such socket not found");
      }
      const [userId]: [number, Socket] = pair;
      usersToSockets.delete(userId);
    });
  });

  return {
    appManager,
    httpServer,
    sio
  };
}

function startHttpServer(serverApp: Koa): HttpServer | undefined {
  let httpServer: HttpServer | undefined;
  if (config.get("server.http.enabled")) {
    httpServer = http.createServer(serverApp.callback());
    httpServer.listen(config.get("server.http.port"), config.get("server.http.host"));
    httpServer.on("error", serverErrorHandler);
    httpServer.on("listening", () => {
      const address = httpServer!.address();
      if (typeof address === "string") {
        console.log(`Listening on ${httpServer!.address()}; env: ${process.env.NODE_ENV}`);
      } else {
        console.log(`Listening on http://${address.address}:${address.port};` +
          ` env: ${process.env.NODE_ENV}`);
      }
    });
  }
  return httpServer;
}

const creating = create();

process.on("SIGINT", exit);
process.on("SIGTERM", exit);

async function exit(): Promise<void> {
  try {
    const {appManager, httpServer, sio} = await creating;

    await sio.close();

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
    console.log("Server destroyed");
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
