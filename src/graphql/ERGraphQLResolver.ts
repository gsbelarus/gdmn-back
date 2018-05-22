import {AccessMode, AConnection} from "gdmn-db";
import {GraphQLResolveInfo} from "graphql/type/definition";
import NestHydrationJS from "nesthydrationjs";
import {User} from "../context/User";
import {IArgs, IERGraphQLResolver} from "./ERGraphQLSchema";
import ERQueryAnalyzer, {IQuery} from "./ERQueryAnalyzer";
import {IEntityQueryField, SQLBuilder} from "./sql/SQLBuilder";

export class ERGraphQLResolver implements IERGraphQLResolver {

  public async queryResolver(source: any, args: IArgs, context: User, info: GraphQLResolveInfo): Promise<any> {
    const queries = ERQueryAnalyzer.resolveInfo(info);
    if (queries.length) {
      const query = queries[0];

      const {sql, params, fieldAliases} = new SQLBuilder(context, query).build();

      return await context.executeTransaction(({connection, transaction}) => {
          return AConnection.executeQueryResultSet({
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
              return NestHydrationJS().nest(result, [this._getDefinition(query, fieldAliases)]);
            }
          });
        },
        {
          accessMode: AccessMode.READ_ONLY
        });
    }
    return null;
  }

  private _getDefinition(query: IQuery, fieldAliases: Map<IEntityQueryField, string>): any {
    const definition: any = {};

    query.fields.reduce((def, field) => {
      if (!field.query) {
        def[field.selectionValue] = {column: fieldAliases.get(field) || ""};
      }
      return def;
    }, definition);

    query.fields.reduce((def, field) => {
      if (field.query) {
        def[field.selectionValue] = field.isArray
          ? [this._getDefinition(field.query as IQuery, fieldAliases)]
          : this._getDefinition(field.query as IQuery, fieldAliases);
      }
      return def;
    }, definition);

    return definition;
  }
}
