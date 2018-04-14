import {Factory, IDefaultConnectionPoolOptions} from "gdmn-db";
import {IDB} from "../Context";

const broiler: IDB<IDefaultConnectionPoolOptions> = {
  alias: "broiler",
  poolInstance: Factory.FBDriver.newDefaultConnectionPool(),
  poolOptions: {
    max: 3
  },
  dbOptions: {
    host: "brutto",
    port: 3053,
    username: "SYSDBA",
    password: "masterkey",
    path: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
  }
};

export interface IDBs {
  [alias: string]: IDB;
}

const databases: IDBs = {
  broiler
};

export default databases;
