import Router from "koa-router";
import {ApplicationManager} from "../ApplicationManager";
import path from "path";

export default new Router()
  .post("/", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    const appUid = ctx.params.uid;
    const alias = ctx.request.body.alias;

    const socket = ctx.state.socket;

    if (socket === undefined) {
      await appManager.makeBackup(appUid, alias);
    } else {
      socket.emit("backupStarted");
      appManager.makeBackup(appUid, alias)
        .then(() => {
          socket.emit("backupFinished");
        })
        .catch((error) => console.error(error));
    }

    ctx.status = 200;
    return ctx;
  })
  .get("/", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    const appUid = ctx.params.uid;

    const backups = await appManager.getBackups(appUid);

    ctx.status = 200;
    ctx.body = backups;
    return ctx;
  })
  .post("/:backupUid/download", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    const backupUid = ctx.params.backupUid;

    const { backupPath, backupReadStream } = appManager.downloadBackup(backupUid);

    const backupName = path.basename(backupPath);
    ctx.set("Content-disposition", `attachment; filename="${backupName}"`);
    ctx.type = "application/octet-stream";
    ctx.body = backupReadStream;
    return ctx;
  })
  .post("/upload", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;

    const appUid = ctx.params.uid;
    const bkpFilePath = ctx.request.body.bkpFile;
    const alias = ctx.request.body.alias;

    await appManager.uploadBackup(appUid, bkpFilePath, alias);

    ctx.status = 200;
    return ctx;
  })
  .post("/:backupUid/restore", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;

    const appUid = ctx.params.uid;
    const backupUid = ctx.params.backupUid;

    const socket = ctx.state.socket;

    if (socket === undefined) {
      await appManager.makeRestore(appUid, backupUid);
    } else {
      socket.emit("restoreStarted");
      appManager.makeRestore(appUid, backupUid)
      .then(() => {
        socket.emit("restoreFinished");
      })
      .catch((error) => console.error(error));
    }

    ctx.status = 200;
    return ctx;
  });
