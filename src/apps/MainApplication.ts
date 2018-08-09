import crypto from "crypto";
import {ReadStream} from "fs";
import {AccessMode, AConnection, AService} from "gdmn-db";
import {IServiceOptions} from "../../node_modules/gdmn-db/dist/definitions/fb/Service";
import {Application} from "../context/Application";

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
}

export interface IAppBackupInfoOutput {
  uid: string;
}

export interface IAppBackupExport {
  backupPath: string;
  backupReadStream: ReadStream;
}

export class MainApplication extends Application {

  private static _createPasswordHash(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1, 128, "sha1").toString("base64");
  }

  public async onCreate(connection: AConnection): Promise<void> { // TODO заменить на работу через erModel
    await super.onCreate(connection);

    await AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {

        // user
        await connection.execute(transaction, `
          CREATE TABLE APP_USER (
            ID                  INT                   NOT NULL    PRIMARY KEY,
            LOGIN               VARCHAR(32)           NOT NULL    UNIQUE,
            PASSWORD_HASH       BLOB SUB_TYPE TEXT    NOT NULL,
            SALT                BLOB SUB_TYPE TEXT    NOT NULL,
            IS_ADMIN            SMALLINT
          )
        `);
        await connection.execute(transaction, `CREATE GENERATOR GEN_APP_USER_ID`);
        await connection.execute(transaction, `SET GENERATOR GEN_APP_USER_ID TO 0`);
        await connection.execute(transaction, `
          CREATE TRIGGER APP_USER_BI FOR APP_USER
          ACTIVE BEFORE INSERT POSITION 0
          AS
          BEGIN
            IF (NEW.ID IS NULL) THEN NEW.ID = GEN_ID(GEN_APP_USER_ID, 1);
          END
        `);

        // application
        await connection.execute(transaction, `
          CREATE TABLE APPLICATION (
            ID                  INT                   NOT NULL    PRIMARY KEY,
            UID                 VARCHAR(36)           NOT NULL    UNIQUE
          )
        `);
        await connection.execute(transaction, `CREATE GENERATOR GEN_APPLICATION_ID`);
        await connection.execute(transaction, `SET GENERATOR GEN_APPLICATION_ID TO 0`);
        await connection.execute(transaction, `
          CREATE TRIGGER APPLICATION_BI FOR APPLICATION
          ACTIVE BEFORE INSERT POSITION 0
          AS
          BEGIN
            IF (NEW.ID IS NULL) THEN NEW.ID = GEN_ID(GEN_APPLICATION_ID, 1);
          END
        `);

        // user applications
        await connection.execute(transaction, `
          CREATE TABLE APP_USER_APPLICATIONS (
            ID                  INT                   NOT NULL    PRIMARY KEY,
            USER_KEY            INT                   NOT NULL    REFERENCES APP_USER,
            APP_KEY             INT                   NOT NULL    REFERENCES APPLICATION,
            ALIAS               VARCHAR(32)           NOT NULL,
            DELETED             SMALLINT
          )
        `);
        await connection.execute(transaction, `CREATE GENERATOR GEN_APP_USER_APPLICATIONS_ID`);
        await connection.execute(transaction, `SET GENERATOR GEN_APP_USER_APPLICATIONS_ID TO 0`);
        await connection.execute(transaction, `
          CREATE TRIGGER APP_USER_APPLICATIONS_BI FOR APP_USER_APPLICATIONS
          ACTIVE BEFORE INSERT POSITION 0
          AS
          BEGIN
            IF (NEW.ID IS NULL) THEN NEW.ID = GEN_ID(GEN_APP_USER_APPLICATIONS_ID, 1);
          END
        `);

        // application backups
        await connection.execute(transaction, `
          CREATE TABLE APPLICATION_BACKUPS (
            ID                  INT                   NOT NULL    PRIMARY KEY,
            UID                 VARCHAR(36)           NOT NULL    UNIQUE,
            APP_KEY             INT                   NOT NULL    REFERENCES APPLICATION,
            ALIAS               VARCHAR(32),
            DELETED             SMALLINT
          )
        `);
        await connection.execute(transaction, `CREATE GENERATOR GEN_APPLICATION_BACKUPS_ID`);
        await connection.execute(transaction, `SET GENERATOR GEN_APPLICATION_BACKUPS_ID TO 0`);
        await connection.execute(transaction, `
          CREATE TRIGGER APPLICATION_BACKUPS_BI FOR APPLICATION_BACKUPS
          ACTIVE BEFORE INSERT POSITION 0
          AS
          BEGIN
            IF (NEW.ID IS NULL) THEN NEW.ID = GEN_ID(GEN_APPLICATION_BACKUPS_ID, 1);
          END
        `);

      }
    });

    await this.addUser({login: "Administrator", password: "Administrator", admin: true});
  }

  public async addUser(user: IUserInput): Promise<IUserOutput> {
    const salt = crypto.randomBytes(128).toString("base64");
    const passwordHash = MainApplication._createPasswordHash(user.password, salt);

    return await this.executeConnection((connection) => AConnection.executeTransaction({
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
    }));
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

  public async addApplicationInfo(userKey: number, application: IApplicationInfoInput): Promise<void> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        const result = await connection.executeReturning(transaction, `
          INSERT INTO APPLICATION (UID)
          VALUES (:uid)
          RETURNING ID
        `, {uid: application.uid});

        await connection.execute(transaction, `
          INSERT INTO APP_USER_APPLICATIONS (USER_KEY, APP_KEY, ALIAS)
          VALUES (:userKey, :appKey, :alias)
        `, {
          userKey,
          appKey: result.getNumber("ID"),
          alias: application.alias
        });
      }
    }));
  }

  public async deleteApplicationInfo(userKey: number, uid: string): Promise<void> {
    await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        await connection.execute(transaction, `
          UPDATE APP_USER_APPLICATIONS
            SET DELETED = :deleted
          WHERE USER_KEY = :userKey
            AND EXISTS (
              SELECT ID
              FROM APPLICATION app
              WHERE app.ID = APP_KEY
                AND app.UID = :uid
            )
        `, {
          deleted: true,
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
            app.UID
          FROM APP_USER_APPLICATIONS apps
            LEFT JOIN APPLICATION app ON app.ID = apps.APP_KEY
          WHERE COALESCE(apps.DELETED, 0) = 0
            ${userKey !== undefined ? `AND apps.USER_KEY = :userKey` : ""}
        `,
        params: {userKey},
        callback: async (resultSet) => {
          const result: IApplicationInfoOutput[] = [];
          while (await resultSet.next()) {
            result.push({
              alias: resultSet.getString("ALIAS"),
              uid: resultSet.getString("UID")
            });
          }
          return result;
        }
      })
    }));
  }

  public async getAppId(appUid: string): Promise<number> {
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

  public async addBackup(appId: number, backupUid: string, alias?: string): Promise<void> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: async (transaction) => {
        await connection.execute(transaction, `
          INSERT INTO APPLICATION_BACKUPS (UID, APP_KEY, ALIAS)
          VALUES (:backupUid, :appId, :alias)
        `, {backupUid, appId, alias: alias || "undefined"});
      }
    }));
  }

  public async backup(svcOptions: IServiceOptions, appPath: string, backupPath: string): Promise<void> {
    const svcManager: AService = this.dbDetail.driver.newService();
    await svcManager.attach(svcOptions);
    try {
      await svcManager.backupDatabase(appPath, backupPath);
    } finally {
      await svcManager.detach();
    }
  }

  public async restore(svcOptions: IServiceOptions, appPath: string, backupPath: string): Promise<void> {
    const svcManager: AService = this.dbDetail.driver.newService();
    await svcManager.attach(svcOptions);
    try {
      await svcManager.restoreDatabase(appPath, backupPath);
    } finally {
      await svcManager.detach();
    }
  }

  public async getBackups(appUid: string): Promise<IAppBackupInfoOutput[]> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      callback: (transaction) => AConnection.executeQueryResultSet({
        connection,
        transaction,
        sql: `
          SELECT
            backup.UID
          FROM APPLICATION_BACKUPS backup
            LEFT JOIN APPLICATION app ON backup.APP_KEY = app.ID
          WHERE app.UID = :appUid
        `,
        params: {appUid},
        callback: async (resultSet) => {
          const result: IAppBackupInfoOutput[] = [];
          while (await resultSet.next()) {
            result.push({
              uid: resultSet.getString("UID")
            });
          }
          return result;
        }
      })
    }));
  }
}
