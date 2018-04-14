import {DBStructure, IDBOptions, TConnectionPool} from "gdmn-db";
import {ERModel} from "gdmn-orm";

export interface IDB<PoolOptions = any> {
  alias: string;
  dbOptions: IDBOptions;
  poolOptions: PoolOptions;
  poolInstance: TConnectionPool<PoolOptions>;
}

interface ISources {
  db: IDB;
  dbStructure: DBStructure;
  erModel: ERModel;
}

export abstract class Context {

  private _sources: ISources;

  protected constructor(sources: ISources) {
    this._sources = sources;
  }

  get context(): Context {
    return this;
  }

  get db(): IDB<any> {
    return this._sources.db;
  }

  get dbStructure(): DBStructure {
    return this._sources.dbStructure;
  }

  get erModel(): ERModel {
    return this._sources.erModel;
  }
}
