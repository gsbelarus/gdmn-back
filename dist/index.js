"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_yoga_1 = require("graphql-yoga");
const connection_1 = require("./db/connection");
connection_1.connect();
const typeDefs = `
  type Query {
    hello(name: String): String!
  }
`;
const resolvers = {
    Query: {
        hello: (_, args) => `Hello ${args.name || 'World'}`,
    },
};
const server = new graphql_yoga_1.GraphQLServer({ typeDefs, resolvers });
server.express.get('/hello', (req, res) => res.send('Hello World!'));
server.start(() => console.log('Server is running on localhost:4000'));
//# sourceMappingURL=index.js.map