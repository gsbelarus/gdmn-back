import {GraphQLServer} from "graphql-yoga";
import {AConnectionPool, ADatabase, ATransaction} from "gdmn-db";
import databases, {IDBAlias} from "./db/databases";
import {erExport, ERModel} from "gdmn-orm";

const erModel = new ERModel();

async function init({ poolInstance, options, dbOptions }: IDBAlias<any>) {
  await poolInstance.create(dbOptions, options);

  return await AConnectionPool.executeDatabase(poolInstance,
    database => ADatabase.executeTransaction(database, async transaction => {
      // example
      await ATransaction.executeResultSet(transaction, "SELECT * FROM GD_DOCUMENT", null,
        async resultSet => {
          await resultSet.to(1);
          while (await resultSet.previous()) {
            console.log(resultSet.getArray());
          }
        });

        return await transaction.readDBStructure();
    }));
}

init(databases.broiler)
.then( dbs => erExport(dbs, erModel) )
.then( erm => console.log(erm) )
.catch(console.warn);

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
server.express.get("/er", (req, res) => res.send(erModel) );

server.start(() => console.log("Server is running on localhost:4000")).catch(console.error);
