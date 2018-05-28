import bodyParser from "body-parser";
import {AConnection} from "gdmn-db";
import {EntityLink, EntityQuery, EntityQueryField} from "gdmn-orm";
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

  const application = await Application.create(databases.broiler);

  const graphQLServer = new GraphQLServer({
    schema: application.erGraphQLSchema,
    context: (params) => User.login(application.context, {username: "user", password: "password"})
  });

  graphQLServer.express.use(bodyParser.json(), (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  graphQLServer.express.get("/er", async (req, res) => {
    console.log("GET /er");
    res.send(JSON.stringify(application.erModel.serialize()));
  });

  graphQLServer.express.post("/data", async (req, res, next) => {  // TODO replace with GraphQL?
    console.log("GET /data");
    try {
      const context = application.context;
      const bodyQuery = EntityQuery.inspectorToObject(context.erModel, req.body);
      const {sql, params, fieldAliases} = new SQLBuilder(context, bodyQuery).build();

      const data = await AConnection.executeQueryResultSet({
        connection: context.connection,
        transaction: context.readTransaction,
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
      });

      function deepFindLink(link: EntityLink, field: EntityQueryField): EntityLink {
        const find = link.fields
          .filter((qField) => !qField.link)
          .some((qField) => qField === field);

        if (find) {
          return link;
        }

        for (const qField of link.fields) {
          if (qField.link) {
            const findLink = deepFindLink(qField.link, field);
            if (findLink) {
              return findLink;
            }
          }
        }
        return link;
      }

      const aliases = [];
      for (const [key, value] of fieldAliases) {
        aliases.push({
          alias: deepFindLink(bodyQuery.link, key).alias,
          attribute: key.attribute.name,
          values: value
        });
      }
      res.send({data, aliases});
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
