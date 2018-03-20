import {GraphQLServer} from "graphql-yoga";
import {ADatabase} from "gdmn-db";
import databases from "./db/databases";
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
    const {poolInstance, max, options} = databases.broiler;

    await poolInstance.create(options, max);
    const dbStructure = await ADatabase.executeTransactionPool(poolInstance,
        transaction => transaction.readDBStructure());

    console.log(dbStructure);
}

const typeDefs = `
  type Query {
    hello(name: String): String!
  }
`;

const resolvers = {
    Query: {
        hello: (_: any, args: any) => `Hello ${args.name || "World"}`,
    },
};

const server = new GraphQLServer({typeDefs, resolvers});

server.express.get("/hello", (req, res) => res.send("Hello World!"));

server.start(() => console.log("Server is running on localhost:4000")).catch(console.error);
