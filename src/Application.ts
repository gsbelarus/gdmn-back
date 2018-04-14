import {AConnectionPool, ADatabase} from "gdmn-db";
import {erExport, ERModel} from "gdmn-orm";
import {Context, IDB} from "./Context";

export class Application extends Context {

  private _isDestroyed: boolean = false;

  public static async create(db: IDB<any>): Promise<Application> {
    const {poolInstance, poolOptions, dbOptions}: IDB<any> = db;
    await poolInstance.create(dbOptions, poolOptions);

    const dbStructure = await AConnectionPool.executeDatabase(poolInstance,
      (database) => ADatabase.executeTransaction(database, async (transaction) => {
        return await transaction.readDBStructure();
      }));

    const erModel = erExport(dbStructure, new ERModel());
    console.log(erModel);

    return new Application({db, dbStructure, erModel});
  }

  public static async destroy(app: Application): Promise<boolean> {
    await app.db.poolInstance.destroy();
    return app._isDestroyed = true;
  }

  public isDestroyed(): boolean {
    return this._isDestroyed;
  }
}
