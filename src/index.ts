import {GraphQLServer} from "graphql-yoga";
import {Server as HttpServer} from "http";
import {Server as HttpsServer} from "https";
import {Application} from "./context/Application";
import {User} from "./context/User";
import databases from "./db/databases";

interface IServer {
  application: Application;
  server: HttpServer | HttpsServer;
}

async function create(): Promise<IServer> {
  const env = process.env.NODE_ENV || "development";

  const application = await Application.create(databases.broiler);

  const graphQLServer = new GraphQLServer({
    schema: application.erGraphQLSchema,
    context: (params) => User.login(application.context, {username: "user", password: "password"})
  });

  graphQLServer.express.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  graphQLServer.express.get("/er", async (req, res) => {
    console.log("GET /er");
    res.send(JSON.stringify(application.erModel.serialize()));
  });

  const server = await graphQLServer.start({
    tracing: env === "development",
    port: 4000
  });
  console.log(`Server is running on http://localhost:${server.address().port}`);

  return {application, server};
}

const creating = create();
creating.catch(console.error);

process.on("SIGINT", exit);
process.on("SIGTERM", exit);

async function exit(): Promise<void> {
  try {
    const {application, server} = await creating;

    await server.close();
    await Application.destroy(application);

    console.log("Application destroyed");
  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
}
