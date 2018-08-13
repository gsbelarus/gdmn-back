import {AccessMode, AConnection, DBStructure} from "gdmn-db";
import {ERBridge, IQueryResponse} from "gdmn-er-bridge";
import {ERModel, IEntityQueryInspector} from "gdmn-orm";
import {Database, IDBDetail} from "../db/Database";

export abstract class Application extends Database {

  private _dbStructure: DBStructure = new DBStructure();
  private _erModel: ERModel = new ERModel();

  protected constructor(dbDetail: IDBDetail) {
    super(dbDetail);
  }

  get dbStructure(): DBStructure {
    return this._dbStructure;
  }

  get erModel(): ERModel {
    return this._erModel;
  }

  public async query(query: IEntityQueryInspector): Promise<IQueryResponse> {
    return await this.executeConnection(async (connection) => {
      return await new ERBridge(connection).query(this._erModel, this._dbStructure, query);
    });
  }

  public async reload(): Promise<void> {
    await this.executeConnection(async (connection) => {
      const erBridge = new ERBridge(connection);
      await erBridge.initDatabase();

      await AConnection.executeTransaction({
        connection,
        options: {accessMode: AccessMode.READ_ONLY},
        callback: async (transaction) => {

          console.time("DBStructure load time");
          this._dbStructure = await this.dbDetail.driver.readDBStructure(connection, transaction);
          console.log(`DBStructure: ${Object.entries(this._dbStructure.relations).length} relations loaded...`);
          console.timeEnd("DBStructure load time");

          console.time("erModel load time");
          await erBridge.exportFromDatabase(this._dbStructure, transaction, this._erModel);
          console.log(`erModel: loaded ${Object.entries(this._erModel.entities).length} entities`);
          console.timeEnd("erModel load time");
        }
      });
    });
  }

  protected async _onCreate(_connection: AConnection): Promise<void> {
    await super._onCreate(_connection);
    const erBridge = new ERBridge(_connection);
    await erBridge.initDatabase();
  }

  protected async _onConnect(): Promise<void> {
    await super._onConnect();

    await this.reload();
  }
}
