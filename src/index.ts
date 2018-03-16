import {GraphQLServer} from "graphql-yoga";
import Initializer from "./db/Initializer";
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

Initializer.init({
    host: "brutto",
    port: 3053,
    user: "SYSDBA",
    password: "masterkey",
    database: "k:\\bases\\broiler\\GDBASE_2017_10_02.FDB",
})
    .then(() => {
        console.log(Initializer.dbStructure);
    })
    .catch(console.error);

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
