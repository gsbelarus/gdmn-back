import crypto from "crypto";
import {AccessMode, AConnection} from "gdmn-db";
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
import {IDBDetail} from "../db/Database";
import {Application} from "./Application";

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

  constructor(dbDetail: IDBDetail) {
    super(dbDetail);
  }

  private static _createPasswordHash(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1, 128, "sha1").toString("base64");
  }

  public async addUser(user: IUserInput): Promise<IUserOutput> {
    return await this.executeConnection((connection) => this._addUserInternal(connection, user));
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

  public async findUser({id, login}: { id?: number, login?: string }): Promise<IUserOutput | undefined> {
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
    return await this.executeConnection((connection) => AConnection.executeTransaction({
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
    }));
  }

  public async addApplicationInfo(userKey: number,
                                  application: IApplicationInfoInput): Promise<IApplicationInfoOutput> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
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
    }));
  }

  public async deleteApplicationInfo(userKey: number, uid: string): Promise<void> {
    await this.executeConnection((connection) => AConnection.executeTransaction({
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
    }));
  }

  public async getApplicationsInfo(userKey?: number): Promise<IApplicationInfoOutput[]> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
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
    }));
  }

  public async getAppKey(appUid: string): Promise<number> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        const result = await connection.executeReturning(transaction, `
            SELECT FIRST 1
              app.ID
            FROM APPLICATION app
            WHERE app.UID = :appUid
        `, {appUid});

        return result.getNumber("ID");
      }
    }));
  }

  public async addBackupInfo(appKey: number, backupUid: string, alias?: string): Promise<void> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        await connection.execute(transaction, `
          INSERT INTO APPLICATION_BACKUPS (UID, APP, ALIAS)
          VALUES (:backupUid, :appKey, :alias)
        `, {backupUid, appKey, alias: alias || "Unknown"});
      }
    }));
  }

  public async deleteBackupInfo(uid: string): Promise<void> {
    await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        await connection.execute(transaction, `
          DELETE FROM APPLICATION_BACKUPS
          WHERE UID = :uid
        `, {uid});
      }
    }));
  }

  public async getBackupsInfo(appUid: string): Promise<IAppBackupInfoOutput[]> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: (transaction) => AConnection.executeQueryResultSet({
        connection,
        transaction,
        sql: `
          SELECT
            backup.UID,
            backup.ALIAS,
            backup.CREATIONDATE
          FROM APPLICATION_BACKUPS backup
            LEFT JOIN APPLICATION app ON app.ID = backup.APP
          WHERE app.UID = :appUid
        `,
        params: {appUid},
        callback: async (resultSet) => {
          const result: IAppBackupInfoOutput[] = [];
          while (await resultSet.next()) {
            result.push({
              uid: resultSet.getString("UID"),
              alias: resultSet.getString("ALIAS"),
              creationDate: resultSet.getDate("CREATIONDATE")!
            });
          }
          return result;
        }
      })
    }));
  }

  protected async _onCreate(connection: AConnection): Promise<void> {
    await super._onCreate(connection);

    await this.erModel.initDataSource(new DataSource(connection));

    const transaction = await this.erModel.startTransaction();
    try {

      // APP_USER
      const userEntity = await this.erModel.create(new Entity({
        name: "APP_USER", lName: {ru: {name: "Пользователь"}}
      }), transaction);
      await userEntity.create(new StringAttribute({
        name: "LOGIN", lName: {ru: {name: "Логин"}}, required: true, minLength: 1, maxLength: 32
      }), transaction);
      await userEntity.create(new BlobAttribute({
        name: "PASSWORD_HASH", lName: {ru: {name: "Хешированный пароль"}}, required: true
      }), transaction);
      await userEntity.create(new BlobAttribute({
        name: "SALT", lName: {ru: {name: "Примесь"}}, required: true
      }), transaction);
      await userEntity.create(new BooleanAttribute({
        name: "IS_ADMIN", lName: {ru: {name: "Флаг администратора"}}
      }), transaction);

      // APPLICATION
      const appEntity = await this.erModel.create(new Entity({
        name: "APPLICATION", lName: {ru: {name: "Приложение"}}
      }), transaction);
      const appUid = new StringAttribute({
        name: "UID", lName: {ru: {name: "Идентификатор приложения"}}, required: true, minLength: 1, maxLength: 36
      });
      await appEntity.create(appUid, transaction);
      await appEntity.addAttrUnique([appUid], transaction);
      await appEntity.create(new TimeStampAttribute({
        name: "CREATIONDATE", lName: {ru: {name: "Дата создания"}}, required: true,
        defaultValue: "CURRENT_TIMESTAMP"
      }), transaction);
      const appSet = new SetAttribute({
        name: "APPLICATIONS", lName: {ru: {name: "Приложения"}}, entities: [appEntity],
        adapter: {crossRelation: "APP_USER_APPLICATIONS"}
      });
      appSet.add(new StringAttribute({
        name: "ALIAS", lName: {ru: {name: "Название приложения"}}, required: true, minLength: 1, maxLength: 120
      }));

      await userEntity.create(appSet, transaction);

      // APPLICATION_BACKUPS
      const backupEntity = await this.erModel.create(new Entity({
        name: "APPLICATION_BACKUPS", lName: {ru: {name: "Резервная копия"}}
      }), transaction);
      const backupUid = new StringAttribute({
        name: "UID", lName: {ru: {name: "Идентификатор бэкапа"}}, required: true, minLength: 1, maxLength: 36
      });
      await backupEntity.create(backupUid, transaction);
      await backupEntity.addAttrUnique([backupUid], transaction);

      await backupEntity.create(new EntityAttribute({
        name: "APP", lName: {ru: {name: "Приложение"}}, required: true, entities: [appEntity]
      }), transaction);
      await backupEntity.create(new TimeStampAttribute({
        name: "CREATIONDATE", lName: {ru: {name: "Дата создания"}}, required: true,
        defaultValue: "CURRENT_TIMESTAMP"
      }), transaction);
      await backupEntity.create(new StringAttribute({
        name: "ALIAS", lName: {ru: {name: "Название бэкапа"}}, required: true, minLength: 1, maxLength: 120
      }), transaction);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
    }

    await this._addUserInternal(connection, {login: "Administrator", password: "Administrator", admin: true});
  }

  private async _addUserInternal(connection: AConnection, user: IUserInput): Promise<IUserOutput> {
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
}
