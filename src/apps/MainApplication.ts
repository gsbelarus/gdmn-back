import config from "config";
import crypto from "crypto";
import {existsSync, mkdirSync, readdirSync} from "fs";
import {AccessMode, AConnection, Factory} from "gdmn-db";
import {DataSource} from "gdmn-er-bridge";
import {
  BlobAttribute,
  BooleanAttribute,
  Entity,
  EntityAttribute,
  SetAttribute,
  StringAttribute,
  TimeStampAttribute
} from "gdmn-orm";
import path from "path";
import {v1 as uuidV1} from "uuid";
import {IDBDetail} from "../db/Database";
import databases from "../db/databases";
import {Application} from "./Application";
import {GDMNApplication} from "./GDMNApplication";
import {Session} from "./Session";

export interface IUserInput {
  login: string;
  password: string;
  admin: boolean;
}

export interface IUserOutput {
  id: number;
  login: string;
  passwordHash: string;
  salt: string;
  admin: boolean;
}

export interface IApplicationInfoInput {
  uid: string;
  alias: string;
}

export interface IApplicationInfoOutput {
  uid: string;
  alias: string;
  creationDate: Date;
}

export interface IAppBackupInfoOutput {
  uid: string;
  alias: string;
  creationDate: Date;
}

export class MainApplication extends Application {

  public static readonly MAIN_DIR = path.resolve(config.get("db.dir"));
  public static readonly WORK_DIR = path.resolve(MainApplication.MAIN_DIR, "work");
  public static readonly APP_EXT = ".FDB";
  public static readonly MAIN_DB = `MAIN${MainApplication.APP_EXT}`;

  private _applications: Map<string, Application> = new Map();

  constructor() {
    super(MainApplication._createDBDetail("auth_db", path.resolve(MainApplication.MAIN_DIR, MainApplication.MAIN_DB)));

    if (!existsSync(MainApplication.MAIN_DIR)) {
      mkdirSync(MainApplication.MAIN_DIR);
    }
    if (!existsSync(MainApplication.WORK_DIR)) {
      mkdirSync(MainApplication.WORK_DIR);
    }
  }

  public static getAppPath(uid: string): string {
    return path.resolve(MainApplication.WORK_DIR, MainApplication._getAppName(uid));
  }

  private static _createDBDetail(alias: string, dbPath: string): IDBDetail {
    return {
      alias,
      driver: Factory.FBDriver,
      poolOptions: {
        max: 100,
        acquireTimeoutMillis: 60000
      },
      connectionOptions: {
        host: config.get("db.host"),
        port: config.get("db.port"),
        username: config.get("db.user"),
        password: config.get("db.password"),
        path: dbPath
      }
    };
  }

  private static _getAppName(uid: string): string {
    return `${uid}${MainApplication.APP_EXT}`;
  }

  private static _createPasswordHash(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1, 128, "sha1").toString("base64");
  }

  public getApplicationSync(uid: string): Application {
    if (!this.connected) {
      throw new Error("MainApplication is not created");
    }
    const application = this._applications.get(uid);
    if (!application) {
      throw new Error("Application not found");
    }
    return application;
  }

  public async getApplication(uid: string, session: Session): Promise<Application> {
    if (!this.connected) {
      throw new Error("MainApplication is not created");
    }
    const application = this._applications.get(uid);
    const applications = await this._getApplicationsInfo(session.connection, session.userKey);
    if (!application || !applications.some((app) => app.uid === uid)) {
      throw new Error("Application not found");
    }
    return application;
  }

  public async createApplication(alias: string, session: Session): Promise<IApplicationInfoOutput> {
    if (!this.connected) {
      throw new Error("ApplicationManager is not created");
    }
    const uid = uuidV1().toUpperCase();
    const appInfo = await this._addApplicationInfo(session.connection, session.userKey, {alias, uid});
    const application = new GDMNApplication(MainApplication._createDBDetail(alias, MainApplication.getAppPath(uid)));
    await application.create();
    this._applications.set(uid, application);
    return appInfo;
  }

  public async deleteApplication(uid: string, session: Session): Promise<void> {
    if (!this.connected) {
      throw new Error("MainApplication is not created");
    }
    const application = this._applications.get(uid);
    if (!application) {
      throw new Error("Application not found");
    }
    if (application.dbDetail.alias !== databases.test.alias) {
      await this._deleteApplicationInfo(session.connection, session.userKey, uid);
      await application.delete();
      // TODO delete backups
    }
  }

  public async addUser(user: IUserInput): Promise<IUserOutput> {
    return await this.executeConnection((connection) => this._addUser(connection, user));
  }

  public async checkUserPassword(login: string, password: string): Promise<IUserOutput | undefined> {
    const user = await this.findUser({login});
    if (user) {
      const passwordHash = MainApplication._createPasswordHash(password, user.salt);
      if (user.passwordHash === passwordHash) {
        return user;
      }
    }
  }

  public async findUser(user: { id?: number, login?: string }): Promise<IUserOutput | undefined> {
    return await this.executeConnection((connection) => this._findUser(connection, user));
  }

  public async getApplicationsInfo(userKey?: number): Promise<IApplicationInfoOutput[]> {
    return await this.executeConnection((connection) => this._getApplicationsInfo(connection, userKey));
  }

  // public async getAppKey(appUid: string): Promise<number> {
  //   return await this.executeConnection((connection) => AConnection.executeTransaction({
  //     connection,
  //     callback: async (transaction) => {
  //       const result = await connection.executeReturning(transaction, `
  //           SELECT FIRST 1
  //             app.ID
  //           FROM APPLICATION app
  //           WHERE app.UID = :appUid
  //       `, {appUid});
  //
  //       return result.getNumber("ID");
  //     }
  //   }));
  // }

  // public async addBackupInfo(appKey: number, backupUid: string, alias?: string): Promise<void> {
  //   return await this.executeConnection((connection) => AConnection.executeTransaction({
  //     connection,
  //     callback: async (transaction) => {
  //       await connection.execute(transaction, `
  //         INSERT INTO APPLICATION_BACKUPS (UID, APP, ALIAS)
  //         VALUES (:backupUid, :appKey, :alias)
  //       `, {backupUid, appKey, alias: alias || "Unknown"});
  //     }
  //   }));
  // }

  // public async deleteBackupInfo(uid: string): Promise<void> {
  //   await this.executeConnection((connection) => AConnection.executeTransaction({
  //     connection,
  //     callback: async (transaction) => {
  //       await connection.execute(transaction, `
  //         DELETE FROM APPLICATION_BACKUPS
  //         WHERE UID = :uid
  //       `, {uid});
  //     }
  //   }));
  // }

  // public async getBackupsInfo(appUid: string): Promise<IAppBackupInfoOutput[]> {
  //   return await this.executeConnection((connection) => AConnection.executeTransaction({
  //     connection,
  //     callback: (transaction) => AConnection.executeQueryResultSet({
  //       connection,
  //       transaction,
  //       sql: `
  //         SELECT
  //           backup.UID,
  //           backup.ALIAS,
  //           backup.CREATIONDATE
  //         FROM APPLICATION_BACKUPS backup
  //           LEFT JOIN APPLICATION app ON app.ID = backup.APP
  //         WHERE app.UID = :appUid
  //       `,
  //       params: {appUid},
  //       callback: async (resultSet) => {
  //         const result: IAppBackupInfoOutput[] = [];
  //         while (await resultSet.next()) {
  //           result.push({
  //             uid: resultSet.getString("UID"),
  //             alias: resultSet.getString("ALIAS"),
  //             creationDate: resultSet.getDate("CREATIONDATE")!
  //           });
  //         }
  //         return result;
  //       }
  //     })
  //   }));
  // }

  protected async _getApplicationsInfo(connection: AConnection, userKey?: number): Promise<IApplicationInfoOutput[]> {
    return await AConnection.executeTransaction({
      connection,
      callback: (transaction) => AConnection.executeQueryResultSet({
        connection,
        transaction,
        sql: `
          SELECT
            apps.ALIAS,
            app.UID,
            app.CREATIONDATE
          FROM APP_USER_APPLICATIONS apps
            LEFT JOIN APPLICATION app ON app.ID = apps.KEY2
          ${userKey !== undefined ? `WHERE apps.KEY1 = :userKey` : ""}
        `,
        params: {userKey},
        callback: async (resultSet) => {
          const result: IApplicationInfoOutput[] = [];
          while (await resultSet.next()) {
            result.push({
              alias: resultSet.getString("ALIAS"),
              uid: resultSet.getString("UID"),
              creationDate: resultSet.getDate("CREATIONDATE")!
            });
          }
          return result;
        }
      })
    });
  }

  protected async _onConnect(): Promise<void> {
    await super._onConnect();

    // TODO tmp
    try {
      const testDBDetail = databases.test;
      if (testDBDetail) {
        this._applications.set(testDBDetail.alias, new GDMNApplication({
          alias: testDBDetail.alias,
          driver: testDBDetail.driver,
          poolOptions: testDBDetail.poolOptions,
          connectionOptions: testDBDetail.connectionOptions
        }));
        await this._executeConnection(async (connection) => {
          const user = await this._findUser(connection, {login: "Administrator"});
          if (user) {
            await this._addApplicationInfo(connection, user.id, {
              alias: testDBDetail.alias,
              uid: testDBDetail.alias
            });
          }
        });
      }
    } catch (error) {
      // ignore
    }

    const applicationsInfo = await this._executeConnection((connection) => this._getApplicationsInfo(connection));
    for (const fileName of readdirSync(MainApplication.WORK_DIR)) {
      const ext = path.extname(path.resolve(MainApplication.WORK_DIR, fileName));
      if (ext === MainApplication.APP_EXT) {
        const appInfo = applicationsInfo.find((info) => MainApplication._getAppName(info.uid) === fileName);
        if (appInfo) {
          const alias = appInfo ? appInfo.alias : "Unknown";
          const dbDetail = MainApplication._createDBDetail(alias, MainApplication.getAppPath(appInfo.uid));
          this._applications.set(appInfo.uid, new GDMNApplication(dbDetail));
        }
      }
    }
  }

  protected async _onCreate(connection: AConnection): Promise<void> {
    await super._onCreate(connection);

    await this.erModel.initDataSource(new DataSource(connection));

    const transaction = await this.erModel.startTransaction();
    try {

      // APP_USER
      const userEntity = await this.erModel.create(transaction, new Entity({
        name: "APP_USER", lName: {ru: {name: "Пользователь"}}
      }));
      await userEntity.create(transaction, new StringAttribute({
        name: "LOGIN", lName: {ru: {name: "Логин"}}, required: true, minLength: 1, maxLength: 32
      }));
      await userEntity.create(transaction, new BlobAttribute({
        name: "PASSWORD_HASH", lName: {ru: {name: "Хешированный пароль"}}, required: true
      }));
      await userEntity.create(transaction, new BlobAttribute({
        name: "SALT", lName: {ru: {name: "Примесь"}}, required: true
      }));
      await userEntity.create(transaction, new BooleanAttribute({
        name: "IS_ADMIN", lName: {ru: {name: "Флаг администратора"}}
      }));

      // APPLICATION
      const appEntity = await this.erModel.create(transaction, new Entity({
        name: "APPLICATION", lName: {ru: {name: "Приложение"}}
      }));
      const appUid = new StringAttribute({
        name: "UID", lName: {ru: {name: "Идентификатор приложения"}}, required: true, minLength: 1, maxLength: 36
      });
      await appEntity.create(transaction, appUid);
      await appEntity.addAttrUnique(transaction, [appUid]);
      await appEntity.create(transaction, new TimeStampAttribute({
        name: "CREATIONDATE", lName: {ru: {name: "Дата создания"}}, required: true,
        defaultValue: "CURRENT_TIMESTAMP"
      }));
      const appSet = new SetAttribute({
        name: "APPLICATIONS", lName: {ru: {name: "Приложения"}}, entities: [appEntity],
        adapter: {crossRelation: "APP_USER_APPLICATIONS"}
      });
      appSet.add(new StringAttribute({
        name: "ALIAS", lName: {ru: {name: "Название приложения"}}, required: true, minLength: 1, maxLength: 120
      }));

      await userEntity.create(transaction, appSet);

      // APPLICATION_BACKUPS
      const backupEntity = await this.erModel.create(transaction, new Entity({
        name: "APPLICATION_BACKUPS", lName: {ru: {name: "Резервная копия"}}
      }));
      const backupUid = new StringAttribute({
        name: "UID", lName: {ru: {name: "Идентификатор бэкапа"}}, required: true, minLength: 1, maxLength: 36
      });
      await backupEntity.create(transaction, backupUid);
      await backupEntity.addAttrUnique(transaction, [backupUid]);

      await backupEntity.create(transaction, new EntityAttribute({
        name: "APP", lName: {ru: {name: "Приложение"}}, required: true, entities: [appEntity]
      }));
      await backupEntity.create(transaction, new TimeStampAttribute({
        name: "CREATIONDATE", lName: {ru: {name: "Дата создания"}}, required: true,
        defaultValue: "CURRENT_TIMESTAMP"
      }));
      await backupEntity.create(transaction, new StringAttribute({
        name: "ALIAS", lName: {ru: {name: "Название бэкапа"}}, required: true, minLength: 1, maxLength: 120
      }));

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
    }

    await this._addUser(connection, {login: "Administrator", password: "Administrator", admin: true});
  }

  private async _addApplicationInfo(connection: AConnection,
                                    userKey: number,
                                    application: IApplicationInfoInput): Promise<IApplicationInfoOutput> {
    return await AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        const result = await connection.executeReturning(transaction, `
          INSERT INTO APPLICATION (UID)
          VALUES (:uid)
          RETURNING ID, CREATIONDATE
        `, {uid: application.uid});

        await connection.execute(transaction, `
          INSERT INTO APP_USER_APPLICATIONS (KEY1, KEY2, ALIAS)
          VALUES (:userKey, :appKey, :alias)
        `, {
          userKey,
          appKey: result.getNumber("ID"),
          alias: application.alias
        });
        return {
          alias: application.alias,
          uid: application.uid,
          creationDate: result.getDate("CREATIONDATE")!
        };
      }
    });
  }

  private async _deleteApplicationInfo(connection: AConnection,
                                       userKey: number,
                                       uid: string): Promise<void> {
    await AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        await connection.execute(transaction, `
          DELETE FROM APP_USER_APPLICATIONS
          WHERE KEY1 = :userKey
            AND EXISTS (
              SELECT ID
              FROM APPLICATION app
              WHERE app.ID = KEY2
                AND app.UID = :uid
            )
        `, {
          userKey,
          uid
        });
      }
    });
  }

  private async _addUser(connection: AConnection, user: IUserInput): Promise<IUserOutput> {
    const salt = crypto.randomBytes(128).toString("base64");
    const passwordHash = MainApplication._createPasswordHash(user.password, salt);

    return await AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        const result = await connection.executeReturning(transaction, `
          INSERT INTO APP_USER (LOGIN, PASSWORD_HASH, SALT, IS_ADMIN)
          VALUES (:login, :passwordHash, :salt, :isAdmin)
          RETURNING ID, LOGIN, PASSWORD_HASH, SALT, IS_ADMIN
        `, {
          login: user.login,
          passwordHash: Buffer.from(passwordHash),
          salt: Buffer.from(salt),
          isAdmin: user.admin
        });
        return {
          id: result.getNumber("ID"),
          login: result.getString("LOGIN"),
          passwordHash: await result.getBlob("PASSWORD_HASH").asString(),
          salt: await result.getBlob("SALT").asString(),
          admin: result.getBoolean("IS_ADMIN")
        };
      }
    });
  }

  private async _findUser(connection: AConnection,
                          {id, login}: { id?: number, login?: string }): Promise<IUserOutput | undefined> {
    if ((id === undefined || id === null) && !login) {
      throw new Error("Incorrect arguments");
    }
    let condition = "";
    if (id !== undefined && id != null && login) {
      condition = "usr.LOGIN = :login AND usr.ID = :id";
    } else if (login) {
      condition = "usr.LOGIN = :login";
    } else {
      condition = "usr.ID = :id";
    }
    return await AConnection.executeTransaction({
      connection,
      options: {accessMode: AccessMode.READ_ONLY},
      callback: (transaction) => AConnection.executeQueryResultSet({
        connection,
        transaction,
        sql: `
          SELECT FIRST 1 *
          FROM APP_USER usr
          WHERE ${condition}
        `,
        params: {id, login},
        callback: async (resultSet) => {
          if (await resultSet.next()) {
            return {
              id: resultSet.getNumber("ID"),
              login: resultSet.getString("LOGIN"),
              passwordHash: await resultSet.getBlob("PASSWORD_HASH").asString(),
              salt: await resultSet.getBlob("SALT").asString(),
              admin: resultSet.getBoolean("IS_ADMIN")
            };
          }
        }
      })
    });
  }
}
