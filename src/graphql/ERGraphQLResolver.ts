import {AccessMode, AConnection} from "gdmn-db";
import {IEntityQueryFieldAlias, SelectBuilder} from "gdmn-er-bridge";
import {EntityLink, EntityQuery, EntityQueryField} from "gdmn-orm";
import {GraphQLResolveInfo, isListType} from "graphql/type/definition";
import NestHydrationJS from "nesthydrationjs";
import {Application} from "../apps/Application";
import {IArgs, IERGraphQLResolver} from "./ERGraphQLSchema";
import ERQueryAnalyzer, {IQuery} from "./ERQueryAnalyzer";

export class ERGraphQLResolver implements IERGraphQLResolver {

  public async queryResolver(_source: any,
                             _args: IArgs,
                             application: Application,
                             info: GraphQLResolveInfo): Promise<any> {
    const queries = ERQueryAnalyzer.resolveInfo(info);
    if (queries.length) {
      const query = queries[0];
      const entityLink = this._convertToEntityLink(query);
      const entityQuery = new EntityQuery(this._completeLink(entityLink));

      const {sql, params, fieldAliases} = new SelectBuilder(application.dbStructure, entityQuery)
        .build();

      const data = await application.executeConnection((connection) => AConnection.executeTransaction({
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

      let definition = this._getDefinition(query, entityLink, fieldAliases);

      if (definition) {
        if (isListType(info.returnType)) {
          definition = [definition];
        }
        return NestHydrationJS().nest(data, definition);
      }
    }
    return null;
  }

  private _convertToEntityLink(query: IQuery, count: number = 0): EntityLink {
    count++;
    const fields = query.fields.map((field) => (
      new EntityQueryField(field.attribute, field.query && this._convertToEntityLink(field.query, count))
    ));
    return new EntityLink(query.entity, `A$${count}`, fields);
  }

  private _completeLink(link: EntityLink): EntityLink {
    const primaryAttr = link.entity.pk[0] && link.entity.attributes[Object.keys(link.entity.attributes)[0]];
    if (!link.fields.some((field) => field.attribute === primaryAttr)) {
      const primaryField = new EntityQueryField(primaryAttr);
      link.fields.unshift(primaryField);
    }

    link.fields.forEach((field) => {
      if (field.link) {
        this._completeLink(field.link);
      }
    });
    return link;
  }

  private _getDefinition(query: IQuery,
                         link: EntityLink,
                         fieldAliases: Map<EntityQueryField, IEntityQueryFieldAlias>): any | undefined {
    const definition: any = {};

    query.fields.reduce((def, field) => {
      if (!field.query) {
        const eQField = link.fields.find((entityField) => entityField.attribute === field.attribute);
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
        const eQField = link.fields.find((entityField) => entityField.attribute === field.attribute);
        if (eQField && eQField.link) {
          const nestedDef = this._getDefinition(field.query, eQField.link, fieldAliases);
          if (nestedDef) {
            def[field.selectionValue] = field.isArray ? [nestedDef] : nestedDef;
          }
        }
      }
      return def;
    }, definition);

    if (!Object.keys(definition).length) {
      return;
    }

    return definition;
  }
}
