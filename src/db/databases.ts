import {DefaultConnectionPoolOptions, Factory, TConnectionPool, TDBOptions} from "gdmn-db";

export type TDB = { [alias: string]: IDBAlias<any> };

export interface IDBAlias<Options> {
    alias: string;
    dbOptions: TDBOptions;
    options: Options,
    poolInstance: TConnectionPool<Options>;
}

const databases: TDB = {
    broiler: <IDBAlias<DefaultConnectionPoolOptions>>{
        alias: "broiler",
        poolInstance: Factory.FBModule.newDefaultConnectionPool(),
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
    }
};

export default databases;