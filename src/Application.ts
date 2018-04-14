import {AConnection, AConnectionPool} from "gdmn-db";
import {erExport, ERModel} from "gdmn-orm";
import {Context, IDBDetail} from "./Context";

export class Application extends Context {

  private _isDestroyed: boolean = false;

  public static async create(db: IDBDetail): Promise<Application> {
    const {poolInstance, poolOptions, connectionOptions}: IDBDetail = db;
    await poolInstance.create(connectionOptions, poolOptions);

    const dbStructure = await AConnectionPool.executeConnection(poolInstance,
      (connection) => AConnection.executeTransaction(connection, async (transaction) => {
        return await transaction.readDBStructure();
      }));

    const erModel = erExport(dbStructure, new ERModel());
    console.log(erModel);

    return new Application({dbDetail: db, dbStructure, erModel});
  }

  public static async destroy(app: Application): Promise<boolean> {
    await app.dbDetail.poolInstance.destroy();
    return app._isDestroyed = true;
  }

  public isDestroyed(): boolean {
    return this._isDestroyed;
  }
}
