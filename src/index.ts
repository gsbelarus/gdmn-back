import bodyParser from "body-parser";
import {AccessMode, AConnection} from "gdmn-db";
import {EntityQuery} from "gdmn-orm";
import {GraphQLServer} from "graphql-yoga";
import {Server as HttpServer} from "http";
import {Server as HttpsServer} from "https";
import {Application} from "./context/Application";
import {User} from "./context/User";
import databases from "./db/databases";
import {SQLBuilder} from "./sql/SQLBuilder";

interface IServer {
  application: Application;
  server: HttpServer | HttpsServer;
}

async function create(): Promise<IServer> {
  const env = process.env.NODE_ENV || "development";

  const application = await Application.create(databases.test);

  const graphQLServer = new GraphQLServer({
    schema: application.erGraphQLSchema,
    context: (_params) => User.login(application.context, {username: "user", password: "password"})
  });

  graphQLServer.express.use(bodyParser.json(), (_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  graphQLServer.express.get("/er", async (_req, res) => {
    console.log("GET /er");
    res.send(JSON.stringify(application.erModel.serialize()));
  });

  graphQLServer.express.post("/data", async (req, res, next) => {  // TODO replace with GraphQL?
    console.log("GET /data");
    try {
      const context = application.context;
      const bodyQuery = EntityQuery.inspectorToObject(context.erModel, req.body);

      const {sql, params, fieldAliases} = new SQLBuilder(context, bodyQuery).build();

      const data = await context.executeConnection((connection) => AConnection.executeTransaction({
          connection,
          options: {accessMode: AccessMode.READ_ONLY},
          callback: (transaction) => AConnection.executeQueryResultSet({
            connection,
            transaction,
            sql,
            params,
            callback: async (resultSet) => {
              const result = [];
              while (await resultSet.next()) {
                const row: { [key: string]: any } = {};
                for (let i = 0; i < resultSet.metadata.columnCount; i++) {
                  // TODO binary blob support
                  row[resultSet.metadata.getColumnLabel(i)] = await resultSet.getAny(i);
                }
                result.push(row);
              }
              return result;
            }
          })
        })
      );

      const aliases = [];
      for (const [key, value] of fieldAliases) {
        const link = bodyQuery.link.deepFindLinkByField(key);
        if (!link) {
          throw new Error("Field not found");
        }
        aliases.push({
          alias: link.alias,
          attribute: key.attribute.name,
          values: value
        });
      }
      res.send({
        data,
        aliases,
        sql: {
          query: sql,
          params
        }
      });
    } catch (error) {
      next(error);
    }
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

    await new Promise((resolve) => server.close(resolve));
    await Application.destroy(application);

  } catch (error) {
    switch (error.message) {
      case "connection shutdown":
        // ignore
        break;
      default:
        console.error(error);
    }
  } finally {
    console.log("Application destroyed");
    process.exit();
  }
}
