import fs from "fs";
import {AccessMode, AConnection, AConnectionPool} from "gdmn-db";
import {erExport} from "gdmn-er-bridge";
import {ERModel} from "gdmn-orm";
import {ERGraphQLResolver} from "../graphql/ERGraphQLResolver";
import {ERGraphQLSchema} from "../graphql/ERGraphQLSchema";
import {Context, IDBDetail} from "./Context";

export class Application extends Context {

  private _isDestroyed: boolean = false;

  public static async create(dbDetail: IDBDetail): Promise<Application> {
    const {driver, poolOptions, connectionOptions}: IDBDetail = dbDetail;

    const connectionPool = driver.newDefaultConnectionPool();
    await connectionPool.create(connectionOptions, poolOptions);
    console.log(JSON.stringify(connectionOptions));

    const result = await AConnectionPool.executeConnection({
      connectionPool,
      callback: (connection) => AConnection.executeTransaction({
        connection,
        options: {accessMode: AccessMode.READ_ONLY},
        callback: async (transaction) => {
          console.time("Total load time");
          console.time("DBStructure load time");
          const dbStructure = await driver.readDBStructure(connection, transaction);
          console.log(`DBStructure: ${Object.entries(dbStructure.relations).length} relations loaded...`);
          console.timeEnd("DBStructure load time");
          console.time("erModel load time");
          const erModel = await erExport(dbStructure, connection, transaction, new ERModel());
          console.log(`erModel: loaded ${Object.entries(erModel.entities).length} entities`);
          console.timeEnd("erModel load time");

          if (fs.existsSync("c:/temp/test")) {
            fs.writeFileSync("c:/temp/test/ermodel.json", erModel.inspect().reduce((p, s) => `${p}${s}\n`, ""));
            console.log("ERModel has been written to c:/temp/test/ermodel.json");
          }

          console.time("ERGraphQLSchema load time");
          const erGraphQLSchema = new ERGraphQLSchema(erModel, "ru", new ERGraphQLResolver());
          console.log("ERGraphQLSchema (ru) loaded...");
          console.timeEnd("ERGraphQLSchema load time");

          console.timeEnd("Total load time");
          return {dbStructure, erModel, erGraphQLSchema};
        }
      })
    });

    return new Application({
      dbDetail,
      connectionPool,
      ...result
    });
  }

  public static async destroy(app: Application): Promise<boolean> {
    await app.connectionPool.destroy();
    return app._isDestroyed = true;
  }

  public isDestroyed(): boolean {
    return this._isDestroyed;
  }
}
