import config from "config";
import crypto from "crypto";
import {existsSync, mkdirSync} from "fs";
import {AccessMode, AConnection, Factory} from "gdmn-db";
import {DataSource} from "gdmn-er-bridge";
import {
  BlobAttribute,
  BooleanAttribute,
  Entity,
  EntityAttribute,
  IntegerAttribute,
  SetAttribute,
  StringAttribute,
  TimeStampAttribute
} from "gdmn-orm";
import log4js from "log4js";
import path from "path";
import {v1 as uuidV1} from "uuid";
import {IDBDetail} from "../db/Database";
import databases from "../db/databases";
import {Application} from "./base/Application";
import {Session} from "./base/Session";
import {ICommand, Level, Task} from "./base/task/Task";
import {GDMNApplication} from "./GDMNApplication";

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

export interface IOptConnectionOptions {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  path?: string;
}

export interface IApplicationInfoInput extends IOptConnectionOptions {
  uid: string;
  alias: string;
  ownerKey?: number;
}

export interface IApplicationInfoOutput extends IOptConnectionOptions {
  uid: string;
  alias: string;
  creationDate: Date;
  ownerKey?: number;
}

export interface IAppBackupInfoOutput {
  uid: string;
  alias: string;
  creationDate: Date;
}

export type MainAction = "DELETE_APP" | "CREATE_APP" | "GET_APPS";

export type MainCommand<A extends MainAction, P> = ICommand<A, P>;

export type CreateAppCommand = MainCommand<"CREATE_APP", { alias: string, connectionOptions?: IOptConnectionOptions }>;
export type DeleteAppCommand = MainCommand<"DELETE_APP", { uid: string }>;
export type GetAppsCommand = MainCommand<"GET_APPS", undefined>;

export class MainApplication extends Application {

  public static readonly DEFAULT_HOST: string = config.get("db.host");
  public static readonly DEFAULT_PORT: number = config.get("db.port");
  public static readonly DEFAULT_USER: string = config.get("db.user");
  public static readonly DEFAULT_PASSWORD: string = config.get("db.password");

  public static readonly MAIN_DIR = path.resolve(config.get("db.dir"));
  public static readonly WORK_DIR = path.resolve(MainApplication.MAIN_DIR, "work");
  public static readonly APP_EXT = ".FDB";
  public static readonly MAIN_DB = `MAIN${MainApplication.APP_EXT}`;

  private _applications: Map<string, Application> = new Map();

  constructor() {
    super(MainApplication._createDBDetail("auth_db", path.resolve(MainApplication.MAIN_DIR, MainApplication.MAIN_DB)),
      log4js.getLogger("MainApp"));

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

  private static _createDBDetail(alias: string, dbPath: string, appInfo?: IApplicationInfoOutput): IDBDetail {
    return {
      alias,
      driver: Factory.FBDriver,
      poolOptions: {
        max: 100,
        acquireTimeoutMillis: 60 * 1000
      },
      connectionOptions: {
        host: appInfo && appInfo.host || MainApplication.DEFAULT_HOST,
        port: appInfo && appInfo.port || MainApplication.DEFAULT_PORT,
        username: appInfo && appInfo.username || MainApplication.DEFAULT_USER,
        password: appInfo && appInfo.password || MainApplication.DEFAULT_PASSWORD,
        path: appInfo && appInfo.path || dbPath
      }
    };
  }

  private static _getAppName(uid: string): string {
    return `${uid}${MainApplication.APP_EXT}`;
  }

  private static _createPasswordHash(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1, 128, "sha1").toString("base64");
  }

  // TODO tmp
  public pushCreateAppCommand(session: Session,
                              command: CreateAppCommand): Task<CreateAppCommand, IApplicationInfoOutput> {
    this._checkSession(session);

    const task = new Task({
      session,
      command,
      level: Level.USER,
      logger: this._taskLogger,
      worker: async (context) => {
        const {alias, connectionOptions} = command.payload;

        const uid = uuidV1().toUpperCase();
        await this._addApplicationInfo(context.session.connection, context.session.userKey, {
          ...connectionOptions,
          ownerKey: connectionOptions ? context.session.userKey : undefined,
          alias,
          uid
        });
        const application = await this.getApplication(context.session, uid);
        await application.create();
        return await this._getApplicationInfo(context.session.connection, context.session.userKey, uid);
      }
    });
    session.taskManager.add(task);
    this.sessionManager.syncTasks();
    return task;
  }

  // TODO tmp
  public pushDeleteAppCommand(session: Session, command: DeleteAppCommand): Task<DeleteAppCommand, void> {
    this._checkSession(session);

    const task = new Task({
      session,
      command,
      level: Level.USER,
      logger: this._taskLogger,
      worker: async (context) => {
        const {uid} = context.command.payload;

        const appInfo = await this._getApplicationInfo(context.session.connection, context.session.userKey, uid);
        const application = await this.getApplication(context.session, uid);
        await this._deleteApplicationInfo(context.session.connection, context.session.userKey, uid);
        if (appInfo.ownerKey !== undefined && appInfo.ownerKey === context.session.userKey) {
          await application.delete();
          this._applications.delete(uid);
        }
      }
    });
    session.taskManager.add(task);
    this.sessionManager.syncTasks();
    return task;
  }

  // TODO tmp
  public pushGetAppsCommand(session: Session, command: GetAppsCommand): Task<GetAppsCommand, IApplicationInfoOutput[]> {
    this._checkSession(session);

    const task = new Task({
      session,
      command,
      level: Level.SESSION,
      logger: this._taskLogger,
      worker: (context) => this._getApplicationsInfo(context.session.connection, context.session.userKey)
    });
    session.taskManager.add(task);
    this.sessionManager.syncTasks();
    return task;
  }

  public async getApplication(session: Session, uid: string): Promise<Application> {
    if (!this.connected) {
      throw new Error("MainApplication is not created");
    }
    const application = this._applications.get(uid);
    const appInfo = await this._getApplicationInfo(session.connection, session.userKey, uid);
    if (!application) {
      const alias = appInfo ? appInfo.alias : "Unknown";
      const dbDetail = MainApplication._createDBDetail(alias, MainApplication.getAppPath(uid), appInfo);
      this._applications.set(uid, new GDMNApplication(dbDetail));

      return this.getApplication(session, uid);
    }
    return application;
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

  protected async _getApplicationInfo(connection: AConnection,
                                      userKey: number,
                                      uid: string): Promise<IApplicationInfoOutput> {
    const appsInfo = await this._getApplicationsInfo(connection, userKey);
    const appInfo = appsInfo.find((info) => info.uid === uid);
    if (!appInfo) {
      throw new Error("Application is not found");
    }
    return appInfo;
  }

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
            app.CREATIONDATE,
            app.OWNER,
            app.HOST,
            app.PORT,
            app.USERNAME,
            app.PASSWORD,
            app.PATH
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
              creationDate: resultSet.getDate("CREATIONDATE")!,
              ownerKey: !resultSet.isNull("OWNER") ? resultSet.getNumber("OWNER") : undefined,
              host: !resultSet.isNull("HOST") ? resultSet.getString("HOST") : undefined,
              port: !resultSet.isNull("PORT") ? resultSet.getNumber("PORT") : undefined,
              username: !resultSet.isNull("USERNAME") ? resultSet.getString("USERNAME") : undefined,
              password: !resultSet.isNull("PASSWORD") ? resultSet.getString("PASSWORD") : undefined,
              path: !resultSet.isNull("PATH") ? resultSet.getString("PATH") : undefined
            });
          }
          return result;
        }
      })
    });
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
      await appEntity.create(transaction, new EntityAttribute({
        name: "OWNER", lName: {ru: {name: "Создатель"}}, required: false, entities: [userEntity]
      }));
      await appEntity.create(transaction, new StringAttribute({
        name: "HOST", lName: {ru: {name: "Хост"}}, maxLength: 260
      }));
      await appEntity.create(transaction, new IntegerAttribute({
        name: "PORT", lName: {ru: {name: "Хост"}}
      }));
      await appEntity.create(transaction, new StringAttribute({
        name: "USERNAME", lName: {ru: {name: "Имя пользователя"}}, maxLength: 260
      }));
      await appEntity.create(transaction, new StringAttribute({
        name: "PASSWORD", lName: {ru: {name: "Пароль"}}, maxLength: 260
      }));
      await appEntity.create(transaction, new StringAttribute({
        name: "PATH", lName: {ru: {name: "Путь"}}, maxLength: 260
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

    const admin = await this._addUser(connection, {login: "Administrator", password: "Administrator", admin: true});
    // TODO tmp
    if (databases.test) {
      await this._addApplicationInfo(connection, admin.id, {
        uid: uuidV1().toUpperCase(),
        alias: databases.test.alias,
        ...databases.test.connectionOptions
      });
    }
  }

  private async _addApplicationInfo(connection: AConnection,
                                    userKey: number,
                                    application: IApplicationInfoInput): Promise<IApplicationInfoOutput> {
    // TODO sharing applications
    return await AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        const result = await connection.executeReturning(transaction, `
          INSERT INTO APPLICATION (UID, OWNER, HOST, PORT, USERNAME, PASSWORD, PATH)
          VALUES (:uid, :owner, :host, :port, :username, :password, :path)
          RETURNING ID, CREATIONDATE, OWNER, HOST, PORT, USERNAME, PASSWORD, PATH
        `, {
          uid: application.uid,
          owner: application.ownerKey,
          host: application.host,
          port: application.port,
          username: application.username,
          password: application.password,
          path: application.path
        });

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
    // TODO sharing applications
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

        await connection.execute(transaction, `
          DELETE FROM APPLICATION
          WHERE UID = :uid
            AND OWNER = :userKey
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
