import {Factory, IDBOptions, IDefaultConnectionPoolOptions, TConnectionPool} from "gdmn-db";

export interface IDB {
  [alias: string]: IDBAlias<any>;
}

export interface IDBAlias<Options> {
  alias: string;
  dbOptions: IDBOptions;
  options: Options;
  poolInstance: TConnectionPool<Options>;
}

const databases: IDB = {
  broiler: {
    alias: "broiler",
    poolInstance: Factory.FBDriver.newDefaultConnectionPool(),
    options: {
      max: 3
    },
    dbOptions: {
      host: "brutto",
      port: 3053,
      username: "SYSDBA",
      password: "masterkey",
      path: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
    }
  } as IDBAlias<IDefaultConnectionPoolOptions>
};

export default databases;
