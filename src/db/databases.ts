import {FirebirdConnectionPool2, FirebirdOptions2, TConnectionPool} from "gdmn-db";

export type TDB = { [alias: string]: IDBAlias<any> };

export interface IDBAlias<Options> {
    alias: string;
    options: Options;
    poolInstance: TConnectionPool<Options>;
    max: number;
}

const databases: TDB = {
    broiler: <IDBAlias<FirebirdOptions2>>{
        alias: "broiler",
        poolInstance: new FirebirdConnectionPool2(),
        max: 100,
        options: {
            host: "brutto",
            port: 3053,
            username: "SYSDBA",
            password: "masterkey",
            dbPath: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
        }
    }
};

export default databases;