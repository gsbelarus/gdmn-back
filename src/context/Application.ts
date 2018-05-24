import fs from "fs";
import {AccessMode} from "gdmn-db";
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

    const connection = await connectionPool.get();
    const readTransaction = await connection.startTransaction({accessMode: AccessMode.READ_ONLY});

    console.log(JSON.stringify(connectionOptions));
    console.time("Total load time");
    console.time("DBStructure load time");
    const dbStructure = await driver.readDBStructure(connection, readTransaction);
    console.log(`DBStructure: ${Object.entries(dbStructure.relations).length} relations loaded...`);
    console.timeEnd("DBStructure load time");
    console.time("erModel load time");
    const erModel = await erExport(dbStructure, connection, readTransaction, new ERModel());
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

    return new Application({
      dbDetail,
      connectionPool,
      connection,
      readTransaction,
      dbStructure,
      erModel,
      erGraphQLSchema
    });
  }

  public static async destroy(app: Application): Promise<boolean> {
    await app.readTransaction.rollback();
    await app.connection.disconnect();
    await app.connectionPool.destroy();
    return app._isDestroyed = true;
  }

  public isDestroyed(): boolean {
    return this._isDestroyed;
  }
}
