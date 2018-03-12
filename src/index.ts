import { GraphQLServer } from 'graphql-yoga';
// ... or using `require()`
// const { GraphQLServer } = require('graphql-yoga')

const typeDefs = `
  type Query {
    hello(name: String): String!
  }
`;

const resolvers = {
  Query: {
    hello: (_: any, args: any) => `Hello ${args.name || 'World'}`,
  },
};

const server = new GraphQLServer({ typeDefs, resolvers });

server.express.get('/hello', (req, res) => res.send('Hello World!'));

server.start(() => console.log('Server is running on localhost:4000'));
