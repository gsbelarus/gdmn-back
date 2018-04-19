import {AConnectionPool, DBStructure, IConnectionOptions} from "gdmn-db";
import {ERModel} from "gdmn-orm";
import {ERGraphQLSchema} from "./graphql/ERGraphQLSchema";

export interface IDBDetail<PoolOptions = any, ConnectionOptions extends IConnectionOptions = IConnectionOptions> {
  alias: string;
  connectionOptions: ConnectionOptions;
  poolOptions: PoolOptions;
  poolInstance: AConnectionPool<PoolOptions>;
}

interface ISources {
  dbDetail: IDBDetail;
  dbStructure: DBStructure;
  erModel: ERModel;
  erGraphQLSchema: ERGraphQLSchema;
}

export abstract class Context {

  private _sources: ISources;

  protected constructor(sources: ISources) {
    this._sources = sources;
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

  get erModel(): ERModel {
    return this._sources.erModel;
  }

  get erGraphQLSchema(): ERGraphQLSchema {
    return this._sources.erGraphQLSchema;
  }
}
