import {
  AConnection,
  AConnectionPool,
  ADriver,
  ATransaction,
  DBStructure,
  IConnectionOptions,
  IDefaultConnectionPoolOptions,
  ITransactionOptions
} from "gdmn-db";
import {TExecutor} from "gdmn-db/dist/definitions/types";
import {ERModel} from "gdmn-orm";
import {ERGraphQLSchema} from "./graphql/ERGraphQLSchema";

export interface IDBDetail<ConnectionOptions extends IConnectionOptions = IConnectionOptions> {
  alias: string;
  driver: ADriver;
  connectionOptions: ConnectionOptions;
  poolOptions: IDefaultConnectionPoolOptions;
}

export interface ISources {
  dbDetail: IDBDetail;
  dbStructure: DBStructure;
  connectionPool: AConnectionPool<IDefaultConnectionPoolOptions>;
  erModel: ERModel;
  erGraphQLSchema: ERGraphQLSchema;
}

export abstract class Context {

  private readonly _sources: ISources;

  protected constructor(sources: ISources) {
    this._sources = sources;
  }

  get sources(): ISources {
    return this._sources;
  }

  get context(): Context {
    return this;
  }

  get dbDetail(): IDBDetail {
    return this._sources.dbDetail;
  }

  get dbStructure(): DBStructure {
    return this._sources.dbStructure;
  }

  get connectionPool(): AConnectionPool<IDefaultConnectionPoolOptions> {
    return this._sources.connectionPool;
  }

  get erModel(): ERModel {
    return this._sources.erModel;
  }

  get erGraphQLSchema(): ERGraphQLSchema {
    return this._sources.erGraphQLSchema;
  }

  public async executeConnection<R>(callback: TExecutor<AConnection, R>): Promise<R> {
    return await AConnectionPool.executeConnection({
      connectionPool: this.connectionPool,
      callback
    });
  }

  public async executeTransaction<R>(callback: TExecutor<{ connection: AConnection, transaction: ATransaction }, R>,
                                     options?: ITransactionOptions): Promise<R> {
    return await this.executeConnection((connection) => AConnection.executeTransaction({
      connection,
      options,
      callback: (transaction) => callback({connection, transaction})
    }));
  }
}
