import config from "config";
import fs, {createReadStream, existsSync, mkdirSync, readdirSync, ReadStream, unlink} from "fs";
import {AService, Factory, IServiceOptions} from "gdmn-db";
import path from "path";
import {v1 as uuidV1} from "uuid";
import {Application} from "./apps/Application";
import {GDMNApplication} from "./apps/GDMNApplication";
import {IAppBackupInfoOutput, IApplicationInfoOutput, MainApplication} from "./apps/MainApplication";
import {IDBDetail} from "./db/Database";
import databases from "./db/databases";

export interface IAppBackupExport {
  backupPath: string;
  backupReadStream: ReadStream;
}

// TODO целостность данных для операций вставки и удаления приложений
export class ApplicationManager {

  public static MAIN_DIR = path.resolve(config.get("db.dir"));
  public static WORK_DIR = path.resolve(ApplicationManager.MAIN_DIR, "work");
  public static APP_EXT = ".FDB";
  public static BACKUP_DIR = path.resolve(ApplicationManager.MAIN_DIR, "backup");
  public static BACKUP_EXT = ".FBK";
  public static MAIN_DB = `MAIN${ApplicationManager.APP_EXT}`;

  private static SERVICE_OPTIONS: IServiceOptions = {
    host: config.get("db.host"),
    port: config.get("db.port"),
    username: config.get("db.user"),
    password: config.get("db.password")
  };

  private _applications: Map<string, Application> = new Map();
  private _mainApplication: MainApplication | undefined;

  get mainApplication(): MainApplication | undefined {
    return this._mainApplication;
  }

  private static _getAppName(uid: string): string {
    return `${uid}${ApplicationManager.APP_EXT}`;
  }

  private static _getAppPath(uid: string): string {
    return path.resolve(ApplicationManager.WORK_DIR, ApplicationManager._getAppName(uid));
  }

  private static _getBackupName(uid: string): string {
    return `${uid}${ApplicationManager.BACKUP_EXT}`;
  }

  private static _getBackupPath(uid: string): string {
    return path.resolve(ApplicationManager.BACKUP_DIR, ApplicationManager._getBackupName(uid));
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
        ...ApplicationManager.SERVICE_OPTIONS,
        path: path.resolve(ApplicationManager.MAIN_DIR, ApplicationManager.MAIN_DB)
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
        path: ApplicationManager._getAppPath(uid)
      }
    };
  }

  public async create(): Promise<void> {
    if (!existsSync(ApplicationManager.MAIN_DIR)) {
      mkdirSync(ApplicationManager.MAIN_DIR);
    }

    this._mainApplication = new MainApplication(ApplicationManager._createMainDBDetail());
    if (!existsSync(path.resolve(ApplicationManager.MAIN_DIR, ApplicationManager.MAIN_DB))) {
      await this._mainApplication.create();
    } else {
      await this._mainApplication.connect();
    }

    // TODO tmp
    try {
      const testDBDetail = databases.test;
      if (testDBDetail) {
        const application = new GDMNApplication({
          alias: testDBDetail.alias,
          driver: testDBDetail.driver,
          poolOptions: testDBDetail.poolOptions,
          connectionOptions: testDBDetail.connectionOptions
        });
        await application.connect();
        this._applications.set(testDBDetail.alias, application);
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
      const ext = path.extname(path.resolve(ApplicationManager.WORK_DIR, fileName));
      if (ext === ApplicationManager.APP_EXT) {
        const appInfo = applicationsInfo.find((info) => ApplicationManager._getAppName(info.uid) === fileName);
        if (appInfo) {
          const dbDetail = ApplicationManager._createDBDetail(appInfo.uid, appInfo ? appInfo.alias : "Unknown");
          const app = new GDMNApplication(dbDetail);
          await app.connect();
          this._applications.set(appInfo.uid, app);
        }
      }
    }
  }

  public async destroy(): Promise<void> {
    for (const application of this._applications.values()) {
      await application.disconnect();
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

  public async delete(userKey: number, uid: string): Promise<void> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const application = this._applications.get(uid);
    if (!application) {
      throw new Error("Application not found");
    }
    if (application.dbDetail.alias !== databases.test.alias) {
      await this._mainApplication.deleteApplicationInfo(userKey, uid);
      await application.delete();
      for (const backup of await this.getBackups(uid)) {
        await this.deleteBackup(backup.uid);
      }
    }
  }

  public async add(userKey: number, alias: string): Promise<IApplicationInfoOutput> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const uid = uuidV1().toUpperCase();
    const result = await this._mainApplication.addApplicationInfo(userKey, {
      uid,
      alias
    });
    const application = new GDMNApplication(ApplicationManager._createDBDetail(uid, alias));
    await application.create();
    this._applications.set(uid, application);
    return result;
  }

  public async getAll(userKey: number): Promise<Array<IApplicationInfoOutput & { size: number }>> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const apps = await this._mainApplication.getApplicationsInfo(userKey);
    return apps.map((appInfo) => {
      const appPath = ApplicationManager._getAppPath(appInfo.uid);
      const size = fs.statSync(appPath).size;
      return {...appInfo, size};
    });
  }

  public async makeBackup(appUid: string, alias?: string): Promise<string> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }

    const backupUid = uuidV1().toUpperCase();
    const backupPath = ApplicationManager._getBackupPath(backupUid);
    const appPath = ApplicationManager._getAppPath(appUid);
    const svcManager: AService = this._mainApplication.dbDetail.driver.newService();
    try {
      await svcManager.attach(ApplicationManager.SERVICE_OPTIONS);
      await svcManager.backupDatabase(appPath, backupPath);
    } finally {
      await svcManager.detach();
    }
    const appId = await this._mainApplication.getAppKey(appUid);
    await this._mainApplication.addBackupInfo(appId, backupUid, alias);

    return backupUid;
  }

  public async getBackups(appUid: string): Promise<Array<IAppBackupInfoOutput & { size: number }>> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }
    const backups = await this._mainApplication.getBackups(appUid);
    return backups.map((backup) => {
      const backupPath = ApplicationManager._getBackupPath(backup.uid);
      const size = fs.statSync(backupPath).size;
      return {...backup, size};
    });
  }

  public downloadBackup(backupUid: string): IAppBackupExport {
    const backupPath = ApplicationManager._getBackupPath(backupUid);
    if (existsSync(backupPath)) {
      return {
        backupPath,
        backupReadStream: createReadStream(backupPath)
      };
    } else {
      throw new Error("Backup not founded");
    }
  }

  public async deleteBackup(backupUid: string): Promise<void> {
    const backupPath = ApplicationManager._getBackupPath(backupUid);
    return new Promise<void>((resolve, reject) => unlink(backupPath, (err) => err ? reject(err) : resolve()));
  }

  public async uploadBackup(stream: ReadStream, appUid: string, alias?: string): Promise<void> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }

    const backupUid = uuidV1().toUpperCase();
    const backupPath = ApplicationManager._getBackupPath(backupUid);

    const writer = fs.createWriteStream(backupPath);
    stream.pipe(writer);

    const appId = await this._mainApplication.getAppKey(appUid);
    await this._mainApplication.addBackupInfo(appId, backupUid, alias);
  }

  public async makeRestore(userKey: number, alias: string, backupUid: string): Promise<IApplicationInfoOutput> {
    if (!this._mainApplication) {
      throw new Error("Main application is not created");
    }

    const uid = uuidV1().toUpperCase();
    const options = ApplicationManager._createDBDetail(uid, alias);
    const backupPath = ApplicationManager._getBackupPath(backupUid);
    const svcManager: AService = this._mainApplication.dbDetail.driver.newService();
    try {
      await svcManager.attach(ApplicationManager.SERVICE_OPTIONS);
      await svcManager.restoreDatabase(options.connectionOptions.path, backupPath, {replace: true});
    } finally {
      await svcManager.detach();
    }

    const result = await this._mainApplication.addApplicationInfo(userKey, {
      uid,
      alias
    });
    const application = new GDMNApplication(options);
    await application.connect();
    this._applications.set(uid, application);
    return result;
  }
}
