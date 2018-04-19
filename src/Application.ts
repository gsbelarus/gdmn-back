import {AConnection, AConnectionPool, DBStructure} from "gdmn-db";
import {erExport, ERModel} from "gdmn-orm";
import {Context, IDBDetail} from "./Context";

export class Application extends Context {

  private _isDestroyed: boolean = false;

  public static async create(db: IDBDetail): Promise<Application> {
    const {poolInstance, poolOptions, connectionOptions}: IDBDetail = db;
    await poolInstance.create(connectionOptions, poolOptions);

    const result = await AConnectionPool.executeConnection(poolInstance,
      (connection) => AConnection.executeTransaction(connection, async (transaction) => {
        console.time("time");
        const dbStructure = await transaction.readDBStructure();
        console.log("DBStructure loaded...");
        console.timeEnd("time");
        console.time("time");
        const erModel = await erExport(dbStructure, transaction, new ERModel());
        console.log("erModel: loaded " + Object.entries(erModel.entities).length + " entities");
        console.timeEnd("time");
        return {
          dbStructure,
          erModel
        };
      }));

    return new Application({ ...result, dbDetail: db });
  }

  public static async destroy(app: Application): Promise<boolean> {
    await app.dbDetail.poolInstance.destroy();
    return app._isDestroyed = true;
  }

  public isDestroyed(): boolean {
    return this._isDestroyed;
  }
}
