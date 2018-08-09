import config from "config";
import {existsSync, mkdirSync, readdirSync, createReadStream} from "fs";
import {Factory} from "gdmn-db";
import {extname, resolve, join} from "path";
import {v1 as uuidV1} from "uuid";
import {GDMNApplication} from "./apps/GDMNApplication";
import {IApplicationInfoOutput, MainApplication, IAppBackupInfoOutput, IAppBackupExport} from "./apps/MainApplication";
import {Application} from "./context/Application";
import {IDBDetail} from "./context/Context";
import databases from "./db/databases";
import { IServiceOptions } from "../node_modules/gdmn-db/dist/definitions/fb/Service";
import fs from "fs";
import path from "path";

// TODO целостность данных для операций вставки и удаления приложений
export class ApplicationManager {

  public static MAIN_DIR = resolve(config.get("db.dir"));
  public static WORK_DIR = resolve(ApplicationManager.MAIN_DIR, "work");
  public static BACKUP_DIR = resolve(ApplicationManager.MAIN_DIR, "backup");
  public static BACKUP_EXT = ".fbk";
  public static EXT = ".FDB";
  public static MAIN_DB = `MAIN${ApplicationManager.EXT}`;

  private static serviceOptions: IServiceOptions = {
    host: config.get("db.host"),
    port: config.get("db.port"),
    username: config.get("db.user"),
    password: config.get("db.password"),
  };

  private _applications: Map<string, Application> = new Map();
  private _mainApplication: MainApplication | undefined;

  get mainApplication(): MainApplication | undefined {
    return this._mainApplication;
  }

  private static _createMainDBDetail(): IDBDetail {
    return {
      alias: "auth database",
      driver: Factory.FBDriver,
      poolOptions: {
        max: 3,
        acquireTimeoutMillis: 60000
      },
      connectionOptions: {
        host: config.get("db.host"),
        port: config.get("db.port"),
        username: config.get("db.user"),
        password: config.get("db.password"),
        path: resolve(ApplicationManager.MAIN_DIR, ApplicationManager.MAIN_DB)
      }
    };
  }

  private static _createDBDetail(uid: string, alias: string): IDBDetail {
    return {
      alias,
      driver: Factory.FBDriver,
      poolOptions: {
        max: 3,
        acquireTimeoutMillis: 60000
      },
      connectionOptions: {
        host: config.get("db.host"),
        port: config.get("db.port"),
        username: config.get("db.user"),
        password: config.get("db.password"),
        path: resolve(ApplicationManager.WORK_DIR, `${uid}${ApplicationManager.EXT}`)
      }
    };
  }

  public async create(): Promise<void> {
    if (!existsSync(ApplicationManager.MAIN_DIR)) {
      mkdirSync(ApplicationManager.MAIN_DIR);
    }

    if (!existsSync(resolve(ApplicationManager.MAIN_DIR, ApplicationManager.MAIN_DB))) {
      this._mainApplication = await Application.create(ApplicationManager._createMainDBDetail(), MainApplication);
    } else {
      this._mainApplication = await Application.start(ApplicationManager._createMainDBDetail(), MainApplication);
    }

    // TODO tmp
    try {
      const testDBDetail = databases.test;
      if (testDBDetail) {
        this._applications.set(testDBDetail.alias, await Application.start({
          alias: testDBDetail.alias,
          driver: testDBDetail.driver,
          poolOptions: testDBDetail.poolOptions,
          connectionOptions: testDBDetail.connectionOptions
        }, GDMNApplication));
        const user = await this._mainApplication.findUser({login: "Administrator"});
        if (user) {
          await this._mainApplication.addApplicationInfo(user.id, {alias: testDBDetail.alias, uid: testDBDetail.alias});
        }
      }
    } catch (error) {
      // ignore
    }

    if (!existsSync(ApplicationManager.WORK_DIR)) {
      mkdirSync(ApplicationManager.WORK_DIR);
    }

    if (!existsSync(ApplicationManager.BACKUP_DIR)) {
      mkdirSync(ApplicationManager.BACKUP_DIR);
    }

    const applicationsInfo = await this._mainApplication.getApplicationsInfo();
    for (const fileName of readdirSync(ApplicationManager.WORK_DIR)) {
      const ext = extname(resolve(ApplicationManager.WORK_DIR, fileName));
      if (ext === ApplicationManager.EXT) {
        const uid = fileName.replace(ext, "");
        const application = applicationsInfo.find((info) => info.uid === uid);
        const dbDetail = ApplicationManager._createDBDetail(uid, application ? application.alias : "unknown");
        const app = await Application.start(dbDetail, GDMNApplication);
        this._applications.set(uid, app);
      }
    }
  }

  public async destroy(): Promise<void> {
    for (const application of this._applications.values()) {
      await Application.stop(application);
    }
    this._mainApplication = undefined;
  }

  public async get(userKey: number, uid: string): Promise<Application | undefined> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const applications = await this._mainApplication.getApplicationsInfo(userKey);
    if (applications.some((app) => app.uid === uid)) {
      return this._applications.get(uid);
    }
  }

  public async delete(userKey: number, uid: string): Promise<boolean> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const application = this._applications.get(uid);
    if (!application || application.dbDetail.alias === databases.test.alias) {
      return false;
    }
    await this._mainApplication.deleteApplicationInfo(userKey, uid);
    await Application.delete(application);
    return true;
  }

  public async add(userKey: number, alias: string): Promise<string> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const uid = uuidV1().toUpperCase();
    await this._mainApplication.addApplicationInfo(userKey, {
      uid,
      alias
    });
    const application = await Application.create(ApplicationManager._createDBDetail(uid, alias), GDMNApplication);
    this._applications.set(uid, application);
    return uid;
  }

  public async getAll(userKey: number): Promise<IApplicationInfoOutput[]> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    return await this._mainApplication.getApplicationsInfo(userKey);
  }

  public async makeBackup(appUid: string, alias?: string): Promise<string> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }

    const backupUid = uuidV1().toUpperCase();
    const backupPath = join(ApplicationManager.BACKUP_DIR, `${backupUid}${ApplicationManager.BACKUP_EXT}`);
    const appPath = join(ApplicationManager.WORK_DIR, `${appUid}${ApplicationManager.EXT}`);
    try {
      await this._mainApplication.backup(ApplicationManager.serviceOptions, appPath, backupPath);
    } catch (error) {
      console.log("BACKUP ERROR: ", error);
    }

    try {
      const appId = await this._mainApplication.getAppId(appUid);
      await this._mainApplication.addBackup(appId, backupUid, alias);
    } catch (error) {
      console.log("ERROR when add BACKUP: ", error);
    }

    return backupUid;
  }

  public async getBackups(appUid: string): Promise<IAppBackupInfoOutput[]> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    return await this._mainApplication.getBackups(appUid);
  }

  public downloadBackup(backupUid: string): IAppBackupExport {
    const backupPath = path.join(ApplicationManager.BACKUP_DIR, `${backupUid}${ApplicationManager.BACKUP_EXT}`);
    if (existsSync(backupPath)) {
      return {
        backupPath,
        backupReadStream: createReadStream(backupPath)
      };
    } else {
      throw new Error("Download is impossible. Backup file not found.");
    }
  }

  public async uploadBackup(appUid: string, bkpUploadPath: string, alias?: string): Promise<void> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }

    try {
      const bkpUid = uuidV1().toUpperCase();
      const bkpPathToSave = path.join(ApplicationManager.BACKUP_DIR, `${bkpUid}${ApplicationManager.BACKUP_EXT}`);

      const reader = fs.createReadStream(bkpUploadPath);
      const writer = fs.createWriteStream(bkpPathToSave);
      reader.pipe(writer);

      const appId = await this._mainApplication.getAppId(appUid);
      await this._mainApplication.addBackup(appId, bkpUid, alias);
    } catch (error) {
      console.log("ERROR when upload backup: ", error);
    }
  }

  public async makeRestore(appUid: string, backupUid: string): Promise<void> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }

    try {
      const backupPath = join(ApplicationManager.BACKUP_DIR, `${backupUid}${ApplicationManager.BACKUP_EXT}`);
      const appPath = join(ApplicationManager.WORK_DIR, `${appUid}${ApplicationManager.EXT}`);
      await this._mainApplication.restore(ApplicationManager.serviceOptions, appPath, backupPath);
    } catch (error) {
      console.log("ERROR when restore", error);
    }
  }
}
