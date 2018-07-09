import config from "config";
import {existsSync, mkdirSync, readdirSync} from "fs";
import {Factory} from "gdmn-db";
import {extname, resolve} from "path";
import {v1 as uuidV1} from "uuid";
import {GDMNApplication} from "./apps/GDMNApplication";
import {IApplicationInfoOutput, MainApplication} from "./apps/MainApplication";
import {Application} from "./context/Application";
import {IDBDetail} from "./context/Context";

// TODO целостность данных для операций вставки и удаления приложений
export class ApplicationManager {

  public static MAIN_DIR = resolve(config.get("db.dir"));
  public static WORK_DIR = resolve(ApplicationManager.MAIN_DIR, "work");
  public static EXT = ".FDB";
  public static MAIN_DB = `MAIN${ApplicationManager.EXT}`;

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
    this._applications.set(`broiler`, await Application.start({
      alias: "broiler",
      driver: Factory.FBDriver,
      poolOptions: {
        max: 3,
        acquireTimeoutMillis: 60000
      },
      connectionOptions: {
        host: "192.168.0.34",
        port: 3053,
        username: "SYSDBA",
        password: "masterkey",
        path: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
      }
    }, GDMNApplication));

    if (!existsSync(ApplicationManager.WORK_DIR)) {
      mkdirSync(ApplicationManager.WORK_DIR);
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
    return this._applications.get(uid);
  }

  public async delete(userKey: number, uid: string): Promise<boolean> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    await this._mainApplication.deleteApplicationInfo(userKey, uid);
    const application = this._applications.get(uid);
    if (!application) {
      return false;
    }
    await Application.delete(application);
    return true;
  }

  public async add(userKey: number, alias: string): Promise<string> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const uid = uuidV1();
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
}
