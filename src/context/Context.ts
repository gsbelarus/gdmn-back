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
import {ERGraphQLSchema} from "../graphql/ERGraphQLSchema";
import {User} from "./User";

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
  users?: User[];
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
    if (this._sources) {
      return this._sources.dbDetail;
    }
    throw new Error("No context");
  }

  get dbStructure(): DBStructure {
    if (this._sources) {
      return this._sources.dbStructure;
    }
    throw new Error("No context");
  }

  get connectionPool(): AConnectionPool<IDefaultConnectionPoolOptions> {
    if (this._sources) {
      return this._sources.connectionPool;
    }
    throw new Error("No context");
  }

  get erModel(): ERModel {
    if (this._sources) {
      return this._sources.erModel;
    }
    throw new Error("No context");
  }

  get erGraphQLSchema(): ERGraphQLSchema {
    if (this._sources) {
      return this._sources.erGraphQLSchema;
    }
    throw new Error("No context");
  }

  get users(): User[] {
    if (this._sources) {
      if (!this._sources.users) {
        this._sources.users = [];
      }
      return this._sources.users;
    }
    throw new Error("No context");
  }

  public async executeConnection<R>(callback: TExecutor<AConnection, R>): Promise<R> {
    return await AConnectionPool.executeConnection({
      connectionPool: this.connectionPool,
      callback
    });
  }
}
