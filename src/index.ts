import {AConnectionPool, ADatabase, ATransaction, DBStructure} from "gdmn-db";
import {erExport, ERModel} from "gdmn-orm";
import {GraphQLServer} from "graphql-yoga";
import databases, {IDBAlias} from "./db/databases";

const erModel = new ERModel();

async function init({poolInstance, options, dbOptions}: IDBAlias<any>): Promise<DBStructure> {
  await poolInstance.create(dbOptions, options);

  return await AConnectionPool.executeDatabase(poolInstance,
    (database) => ADatabase.executeTransaction(database, async (transaction) => {
      // example
      await ATransaction.executeResultSet(transaction, "SELECT * FROM GD_DOCUMENT",
        async (resultSet) => {
          await resultSet.to(1);
          while (await resultSet.previous()) {
            console.log(resultSet.getArray());
          }
        });

      return await transaction.readDBStructure();
    }));
}

init(databases.broiler)
  .then((dbs) => erExport(dbs, erModel))
  .then((erm) => console.log(erm))
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

// Add headers
server.express.use( (req, res, next) => {

  // Website you wish to allow to connect
  res.setHeader("Access-Control-Allow-Origin", `http://localhost:3000`);

  // Request methods you wish to allow
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");

  // Request headers you wish to allow
  res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type");

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Pass to next layer of middleware
  next();
});

server.express.get("/hello", (req, res) => res.send("Hello World!"));

server.express.get("/er", (req, res) => {
  console.log("GET /er");
  res.send(JSON.stringify(erModel.serialize()));
});

server.start(() => console.log("Server is running on localhost:4000")).catch(console.error);
