import {GraphQLServer} from "graphql-yoga";
import {Application} from "./Application";
import databases from "./db/databases";

const creatingApp = Application.create(databases.broiler);

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
server.express.use((req, res, next) => {

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

server.express.get("/er", async (req, res) => {
  console.log("GET /er");
  const application = await creatingApp;
  res.send(JSON.stringify(application.erModel.serialize()));
});

server.start(() => console.log("Server is running on localhost:4000")).catch(console.error);

creatingApp
  .then((application) => {
    return new GraphQLServer({schema: application.erGraphQLSchema}).start({port: 4001});
  })
  .catch(console.error);
