import {
  AConnection,
  AConnectionPool,
  ADriver,
  DBStructure,
  IConnectionOptions,
  IDefaultConnectionPoolOptions,
  TExecutor
} from "gdmn-db";
import {ERModel} from "gdmn-orm";

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
}

export abstract class Context {

  private readonly _sources?: ISources;

  protected constructor(sources?: ISources) {
    this._sources = sources;
  }

  get context(): Context {
    return this;
  }

  get dbDetail(): IDBDetail {
    if (!this._sources) {
      throw new Error("No context");
    }
    return this._sources.dbDetail;
  }

  get dbStructure(): DBStructure {
    if (!this._sources) {
      throw new Error("No context");
    }
    return this._sources.dbStructure;
  }

  get connectionPool(): AConnectionPool<IDefaultConnectionPoolOptions> {
    if (!this._sources) {
      throw new Error("No context");
    }
    return this._sources.connectionPool;
  }

  get erModel(): ERModel {
    if (!this._sources) {
      throw new Error("No context");
    }
    return this._sources.erModel;
  }

  public async executeConnection<R>(callback: TExecutor<AConnection, R>): Promise<R> {
    return await AConnectionPool.executeConnection({
      connectionPool: this.connectionPool,
      callback
    });
  }
}
