import {Factory, IDefaultConnectionPoolOptions} from "gdmn-db";
import {IDBDetail} from "../Context";

const broiler: IDBDetail<IDefaultConnectionPoolOptions> = {
  alias: "broiler",
  poolInstance: Factory.FBDriver.newDefaultConnectionPool(),
  poolOptions: {
    max: 3
  },
  connectionOptions: {
    host: "brutto",
    port: 3053,
    username: "SYSDBA",
    password: "masterkey",
    path: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
  }
};

export interface IDBs {
  [alias: string]: IDBDetail;
}

const databases: IDBs = {
  broiler
};

export default databases;
