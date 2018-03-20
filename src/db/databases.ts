import {FirebirdConnectionPool, FirebirdOptions, TConnectionPool} from "gdmn-db";

export type TDB = { [alias: string]: IDBAlias<any> };

export interface IDBAlias<Options> {
    alias: string;
    options: Options;
    poolInstance: TConnectionPool<Options>;
    max: number;
}

const databases: TDB = {
    broiler: <IDBAlias<FirebirdOptions>>{
        alias: "broiler",
        poolInstance: new FirebirdConnectionPool(),
        max: 100,
        options: {
            host: "brutto",
            port: 3053,
            user: "SYSDBA",
            password: "masterkey",
            database: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
        }
    }
};

export default databases;