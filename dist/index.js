"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_yoga_1 = require("graphql-yoga");
const gdmn_db_1 = require("gdmn-db");
// import { connect, disconnect, getReadTransaction } from './db/connection';
//
// (async () => {
//   await connect();
//
//   getReadTransaction().query('SELECT name FROM gd_contact', [],
//     (err, result) => {
//       console.log(JSON.stringify(result));
//     }
//   );
// })();
init().catch(console.warn);
async function init() {
    const connectionPool = new gdmn_db_1.FirebirdConnectionPool();
    await connectionPool.create({
        host: "brutto",
        port: 3053,
        user: "SYSDBA",
        password: "masterkey",
        database: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB"
    }, 100);
    const dbStructure = await gdmn_db_1.FirebirdDatabase.executeTransactionPool(connectionPool, (transaction) => gdmn_db_1.FirebirdDBStructure.readStructure(transaction));
    console.log(dbStructure);
}
const typeDefs = `
  type Query {
    hello(name: String): String!
  }
`;
const resolvers = {
    Query: {
        hello: (_, args) => `Hello ${args.name || "World"}`,
    },
};
const server = new graphql_yoga_1.GraphQLServer({ typeDefs, resolvers });
server.express.get("/hello", (req, res) => res.send("Hello World!"));
server.start(() => console.log("Server is running on localhost:4000")).catch(console.error);
//# sourceMappingURL=index.js.map