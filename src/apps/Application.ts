import {AccessMode, AConnection, DBStructure} from "gdmn-db";
import {ERBridge} from "gdmn-er-bridge";
import {EntityQuery, ERModel, IEntityQueryInspector} from "gdmn-orm";
import {Database, IDBDetail} from "../db/Database";
import {SQLBuilder} from "../sql/SQLBuilder";

export interface IQueryResponse {
  data: any[];
  aliases: Array<{ alias: string, attribute: string, values: any }>;
  sql: {
    query: string;
    params: { [field: string]: any };
  };
}

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
    const bodyQuery = EntityQuery.inspectorToObject(this.erModel, query);

    const {sql, params, fieldAliases} = new SQLBuilder(this, bodyQuery).build();

    const data = await this.executeConnection((connection) => AConnection.executeTransaction({
        connection,
        options: {accessMode: AccessMode.READ_ONLY},
        callback: (transaction) => AConnection.executeQueryResultSet({
          connection,
          transaction,
          sql,
          params,
          callback: async (resultSet) => {
            const result = [];
            while (await resultSet.next()) {
              const row: { [key: string]: any } = {};
              for (let i = 0; i < resultSet.metadata.columnCount; i++) {
                // TODO binary blob support
                row[resultSet.metadata.getColumnLabel(i)] = await resultSet.getAny(i);
              }
              result.push(row);
            }
            return result;
          }
        })
      })
    );

    const aliases = [];
    for (const [key, value] of fieldAliases) {
      const link = bodyQuery.link.deepFindLinkByField(key);
      if (!link) {
        throw new Error("Field not found");
      }
      aliases.push({
        alias: link.alias,
        attribute: key.attribute.name,
        values: value
      });
    }

    return {
      data,
      aliases,
      sql: {
        query: sql,
        params
      }
    };
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

  protected async reload(): Promise<void> {
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
}
