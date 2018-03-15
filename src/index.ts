import { GraphQLServer } from 'graphql-yoga';
import { connect, disconnect, getReadTransaction } from './db/connection';

(async () => {
  await connect();

  getReadTransaction().query('SELECT name FROM gd_contact', [],
    (err, result) => {
      console.log(JSON.stringify(result));
    }
  );
})();

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
