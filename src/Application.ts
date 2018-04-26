import fs from "fs";
import {AConnection, AConnectionPool} from "gdmn-db";
import {erExport, ERModel} from "gdmn-orm";
import util from "util";
import {Context, IDBDetail} from "./Context";
import {ERGraphQLSchema} from "./graphql/ERGraphQLSchema";

export class Application extends Context {

  private _isDestroyed: boolean = false;

  public static async create(dbDetail: IDBDetail): Promise<Application> {
    const {driver, poolInstance, poolOptions, connectionOptions}: IDBDetail = dbDetail;
    await poolInstance.create(connectionOptions, poolOptions);

    console.log(JSON.stringify(connectionOptions));
    console.time("Total load time");
    const result = await AConnectionPool.executeConnection(poolInstance,
      (connection) => AConnection.executeTransaction(connection,
        async (transaction) => {
          console.time("DBStructure load time");
          const dbStructure = await driver.readDBStructure(transaction);
          console.log(`DBStructure: ${Object.entries(dbStructure.relations).length} relations loaded...`);
          console.timeEnd("DBStructure load time");
          console.time("erModel load time");
          const erModel = await erExport(dbStructure, transaction, new ERModel());
          console.log(`erModel: loaded ${Object.entries(erModel.entities).length} entities`);
          console.timeEnd("erModel load time");
          return {
            dbStructure,
            erModel
          };
        }));

    if (fs.existsSync("c:/temp/test")) {
      fs.writeFileSync("c:/temp/test/ermodel.json", result.erModel.inspect().reduce( (p, s) => `${p}${s}\n`, ""));
      console.log("ERModel has been written to c:/temp/test/ermodel.json");
    }

    console.time("ERGraphQLSchema load time");
    const erGraphQLSchema = new ERGraphQLSchema(result.erModel, "ru");
    console.log("ERGraphQLSchema (ru) loaded...");
    console.timeEnd("ERGraphQLSchema load time");

    console.timeEnd("Total load time");

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
