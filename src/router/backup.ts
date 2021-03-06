import {File} from "formidable";
import fs from "fs";
import Router from "koa-router";
import path from "path";
import {ApplicationManager} from "../ApplicationManager";
import {ErrorCodes, throwCtx} from "../ErrorCodes";

function isBkpFileExists(obj: any): obj is { bkpFile: File } {
  return obj && obj.bkpFile;
}

function isAliasExists(obj: any): obj is { alias: string } {
  return obj && obj.alias;
}

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

    ctx.body = {};
  })
  .get("/", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;
    const appUid = ctx.params.uid;

    ctx.body = await appManager.getBackups(appUid);
  })
  .post("/upload", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;

    const files = ctx.request.files;
    if (!isBkpFileExists(files)) {
      return throwCtx(ctx, 400, "files is undefined");
    }
    const appUid = ctx.params.uid;
    const bkpFilePath = files.bkpFile;
    const alias = ctx.request.body.alias;

    const reader = fs.createReadStream(bkpFilePath.path);
    await appManager.uploadBackup(reader, appUid, alias);

    ctx.body = {};
  })
  .delete("/:backupUid", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;

    const backupUid = ctx.params.backupUid;

    await appManager.deleteBackup(backupUid);

    ctx.body = {};
  })
  .post("/:backupUid/download", async (ctx) => {
    const appManager = ctx.state.appManager as ApplicationManager;

    const backupUid = ctx.params.backupUid;

    const {backupPath, backupReadStream} = appManager.downloadBackup(backupUid);

    ctx.set("Content-disposition", `attachment; filename="${path.basename(backupPath)}"`);
    ctx.type = "application/octet-stream";
    ctx.body = backupReadStream;
  })
  .post("/:backupUid/restore", async (ctx) => {
    if (!isAliasExists(ctx.request.body)) {
      throwCtx(ctx, 400, "Alias is not provided", ErrorCodes.INVALID_ARGUMENTS, ["alias"]);
    }
    const appManager = ctx.state.appManager as ApplicationManager;

    const userKey = ctx.state.user.id;
    const alias = ctx.request.body.alias;
    const backupUid = ctx.params.backupUid;
    const socket = ctx.state.socket;

    if (socket === undefined) {
      await appManager.makeRestore(userKey, alias, backupUid);
    } else {
      socket.emit("restoreStarted");
      appManager.makeRestore(userKey, alias, backupUid)
        .then(() => {
          socket.emit("restoreFinished");
        })
        .catch((error) => console.error(error));
    }

    ctx.body = {};
  });
