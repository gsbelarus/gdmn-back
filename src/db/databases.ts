import {DefaultConnectionPoolOptions, Factory, FirebirdOptions, TConnectionPool} from "gdmn-db";

export type TDB = { [alias: string]: IDBAlias<any, any> };

export interface IDBAlias<Options, DBOptions> {
    alias: string;
    dbOptions: DBOptions;
    options: Options,
    poolInstance: TConnectionPool<Options, DBOptions>;
}

const databases: TDB = {
    broiler: <IDBAlias<DefaultConnectionPoolOptions, FirebirdOptions>>{
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
            dbPath: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
        }
    }
};

export default databases;