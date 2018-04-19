import {AConnection, AConnectionPool} from "gdmn-db";
import {erExport, ERModel} from "gdmn-orm";
import {Context, IDBDetail} from "./Context";
import {ERGraphQLSchema} from "./graphql/ERGraphQLSchema";

export class Application extends Context {

  private _isDestroyed: boolean = false;

  public static async create(dbDetail: IDBDetail): Promise<Application> {
    const {poolInstance, poolOptions, connectionOptions}: IDBDetail = dbDetail;
    await poolInstance.create(connectionOptions, poolOptions);

    console.time("total time");
    const result = await AConnectionPool.executeConnection(poolInstance,
      (connection) => AConnection.executeTransaction(connection, async (transaction) => {
        console.time("time");
        const dbStructure = await transaction.readDBStructure();
        console.log("DBStructure loaded...");
        console.timeEnd("time");
        console.time("time");
        const erModel = erExport(dbStructure, transaction, new ERModel());
        console.log("erModel: loaded " + Object.entries(erModel.entities).length + " entities");
        console.timeEnd("time");
        return {
          dbStructure,
          erModel
        };
      }));

    console.time("time");
    const erGraphQLSchema = new ERGraphQLSchema(result.erModel, "ru");
    console.log("ERGraphQLSchema loaded...");
    console.timeEnd("time");

    console.timeEnd("total time");
    return new Application({...result, dbDetail, erGraphQLSchema});
  }

  public static async destroy(app: Application): Promise<boolean> {
    await app.dbDetail.poolInstance.destroy();
    return app._isDestroyed = true;
  }

  public isDestroyed(): boolean {
    return this._isDestroyed;
  }
}
