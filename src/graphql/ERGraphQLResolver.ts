import {AccessMode, AConnection} from "gdmn-db";
import {GraphQLResolveInfo} from "graphql/type/definition";
import NestHydrationJS from "nesthydrationjs";
import {User} from "../context/User";
import {EntityQuery} from "../sql/models/EntityQuery";
import {EntityQueryField} from "../sql/models/EntityQueryField";
import {IEntityQueryFieldAlias, SQLBuilder} from "../sql/SQLBuilder";
import {IArgs, IERGraphQLResolver} from "./ERGraphQLSchema";
import ERQueryAnalyzer, {IQuery} from "./ERQueryAnalyzer";

export class ERGraphQLResolver implements IERGraphQLResolver {

  public async queryResolver(source: any, args: IArgs, context: User, info: GraphQLResolveInfo): Promise<any> {
    const queries = ERQueryAnalyzer.resolveInfo(info);
    if (queries.length) {
      const query = queries[0];
      const entityQuery = this._completeQuery(this._convertToEntityQuery(query));

      const {sql, params, fieldAliases} = new SQLBuilder(context, entityQuery).build();

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
              return NestHydrationJS().nest(result,
                [this._getDefinition(query, entityQuery, fieldAliases)]);
            }
          });
        },
        {
          accessMode: AccessMode.READ_ONLY
        });
    }
    return null;
  }

  private _convertToEntityQuery(query: IQuery): EntityQuery {
    const fields = query.fields.map((field) => (
      new EntityQueryField(field.attribute, field.query && this._convertToEntityQuery(field.query))
    ));
    return new EntityQuery(query.entity, fields);
  }

  private _completeQuery(query: EntityQuery): EntityQuery {
    const primaryAttr = query.entity.pk[0] && query.entity.attributes[Object.keys(query.entity.attributes)[0]];
    if (!query.fields.some((field) => field.attribute === primaryAttr)) {
      const primaryField = new EntityQueryField(primaryAttr);
      query.fields.unshift(primaryField);
    }

    query.fields.forEach((field) => {
      if (field.query) {
        this._completeQuery(field.query);
      }
    });
    return query;
  }

  private _getDefinition(query: IQuery,
                         entityQuery: EntityQuery,
                         fieldAliases: Map<EntityQueryField, IEntityQueryFieldAlias>): any {
    const definition: any = {};

    query.fields.reduce((def, field) => {
      if (!field.query) {
        const eQField = entityQuery.fields.find((entityField) => entityField.attribute === field.attribute);
        if (eQField) {
          const fieldAlias = fieldAliases.get(eQField);
          if (fieldAlias) {
            def[field.selectionValue] = {column: fieldAlias[Object.keys(fieldAlias)[0]]}; // TODO setAttributes
          }
        }
      }
      return def;
    }, definition);

    query.fields.reduce((def, field) => {
      if (field.query) {
        const eQField = entityQuery.fields.find((entityField) => entityField.attribute === field.attribute);
        if (eQField && eQField.query) {
          def[field.selectionValue] = field.isArray
            ? [this._getDefinition(field.query, eQField.query, fieldAliases)]
            : this._getDefinition(field.query, eQField.query, fieldAliases);
        }
      }
      return def;
    }, definition);

    return definition;
  }
}
