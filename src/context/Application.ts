import {AccessMode, AConnection, AConnectionPool} from "gdmn-db";
import {ERBridge} from "gdmn-er-bridge";
import {EntityQuery, ERModel, IEntityQueryInspector} from "gdmn-orm";
import {SQLBuilder} from "../sql/SQLBuilder";
import {Context, IDBDetail, ISources} from "./Context";

export type AppClassType<T extends Application> = new (source: ISources) => T;

export interface IQueryResponse {
  data: any[];
  aliases: Array<{ alias: string, attribute: string, values: any }>;
  sql: {
    query: string;
    params: { [field: string]: any };
  };
}

export abstract class Application extends Context {

  private _isStopped: boolean = false;

  constructor(sources: ISources) {
    super(sources);
  }

  public static async create<T extends Application>(dbDetail: IDBDetail,
                                                    classType: AppClassType<T>): Promise<T> {
    const {driver, connectionOptions}: IDBDetail = dbDetail;
    const connection = driver.newConnection();
    await connection.createDatabase(connectionOptions);
    await connection.disconnect();
    return await Application._start(dbDetail, classType, true);
  }

  public static async delete(app: Application): Promise<void> {
    const {driver, connectionOptions}: IDBDetail = app.dbDetail;
    await Application._stop(app, true);
    const connection = driver.newConnection();
    await connection.connect(connectionOptions);
    await connection.dropDatabase();
  }

  public static async start<T extends Application>(dbDetail: IDBDetail,
                                                   classType: AppClassType<T>): Promise<T> {
    return await Application._start(dbDetail, classType, false);
  }

  public static async stop(app: Application): Promise<void> {
    await Application._stop(app, false);
  }

  private static async _start<T extends Application>(dbDetail: IDBDetail,
                                                     classType: AppClassType<T>,
                                                     creating: boolean): Promise<T> {
    const {driver, poolOptions, connectionOptions}: IDBDetail = dbDetail;
    console.time("Total load time");

    const connectionPool = driver.newCommonConnectionPool();
    await connectionPool.create(connectionOptions, poolOptions);
    console.log(JSON.stringify(connectionOptions));

    const connectionResult = await AConnectionPool.executeConnection({
      connectionPool,
      callback: async (connection) => {
        const erBridge = new ERBridge(connection);
        await erBridge.initDatabase();

        const transactionResult = await AConnection.executeTransaction({
          connection,
          options: {accessMode: AccessMode.READ_ONLY},
          callback: async (transaction) => {

            console.time("DBStructure load time");
            const dbStructure = await driver.readDBStructure(connection, transaction);
            console.log(`DBStructure: ${Object.entries(dbStructure.relations).length} relations loaded...`);
            console.timeEnd("DBStructure load time");

            const application = new classType({
              dbDetail,
              dbStructure,
              connectionPool,
              erModel: new ERModel()
            });

            return {application};
          }
        });
        if (creating) {
          await transactionResult.application.onCreate(connection);
        }
        await transactionResult.application.onStart(connection);
        return transactionResult;
      }
    });

    console.timeEnd("Total load time");
    return connectionResult.application;
  }

  private static async _stop(app: Application, deleting: boolean): Promise<void> {
    await app.onStop();
    if (deleting) {
      await app.onDelete();
    }
    await app.connectionPool.destroy();
    app._isStopped = true;
  }

  public isStopped(): boolean {
    return this._isStopped;
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

  public async onStart(_connection: AConnection): Promise<void> {
    // can override
  }

  public async onStop(): Promise<void> {
    // can override
  }

  public async onCreate(_connection: AConnection): Promise<void> {
    // can override
  }

  public async onDelete(): Promise<void> {
    // can override
  }
}
