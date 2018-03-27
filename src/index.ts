import {GraphQLServer} from "graphql-yoga";
import {ADatabase} from "gdmn-db";
import databases, {IDBAlias} from "./db/databases";

async function init({poolInstance, max, options}: IDBAlias<any>) {
    await poolInstance.create(options, max);
    const dbStructure = await ADatabase.executeTransactionPool(poolInstance,
        async transaction => {

            const resultSet = await transaction.executeSQL("SELECT * FROM GD_DOCUMENT");
            await resultSet.to(1);
            while (await resultSet.previous()) {
                console.log(resultSet.getObject());
            }

            return await transaction.readDBStructure();
        });

    console.log(dbStructure);
}

init(databases.broiler).catch(console.warn);

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
