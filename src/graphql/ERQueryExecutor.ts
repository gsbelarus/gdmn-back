import {AccessMode, AConnection} from "gdmn-db";
import {Attribute} from "gdmn-orm";
import {default as NestHydrationJS} from "nesthydrationjs";
import {Context} from "../context/Context";
import {IQuery, IQueryField} from "./ERQueryAnalyzer";

interface IQueryAlias {
  [relationName: string]: string;
}

export class ERQueryExecutor {

  private _context: Context;

  private _queryAliases = new Map<IQuery, IQueryAlias>();
  private _fieldAliases = new Map<IQueryField, string>();

  private _params: any = {};

  constructor(context: Context) {
    this._context = context;
  }

  private static _fieldTemplate(alias: string, fieldAlias: string, fieldName: string): string {
    return `  ${alias && `${alias}.`}${fieldName} AS ${fieldAlias}`;
  }

  private static _fromTemplate(tableAlias: string, tableName: string): string {
    return `FROM ${tableName} ${tableAlias}`;
  }

  private static _joinTemplate(joinRelationName: string,
                               joinAlias: string,
                               joinFieldName: string,
                               alias: string,
                               fieldName: string): string {
    return `  LEFT JOIN ${joinRelationName} ${joinAlias} ON ` +
      ERQueryExecutor._equalTemplate(joinAlias, joinFieldName, `${alias && `${alias}.`}${fieldName}`);
  }

  private static _equalTemplate(fieldAlias: string, fieldName: string, value: string): string {
    return `${fieldAlias && `${fieldAlias}.`}${fieldName} = ${value}`;
  }

  public async execute(query: IQuery): Promise<any> {
    this._clearVariables();

    this._completeQuery(query);
    this._createAliases(query);

    return await this._context.executeTransaction(({connection, transaction}) => {
        return AConnection.executeQueryResultSet({
          connection,
          transaction,
          sql: this._getSelect(query),
          params: this._params,
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
            return NestHydrationJS().nest(result, [this._getDefinition(query)]);
          }
        });
      },
      {
        accessMode: AccessMode.READ_ONLY
      });
  }

  private _completeQuery(query: IQuery): void {
    const primaryKey = this._getPrimaryKey(query);
    if (!query.fields.some((field) => field.attribute === primaryKey)) {
      const primaryField: IQueryField = {
        attribute: primaryKey,
        isArray: false,
        selectionValue: primaryKey.name
      };
      query.fields.unshift(primaryField);
    }

    query.fields.forEach((field) => {
      if (field.query) {
        this._completeQuery(field.query);
      }
    });
  }

  private _createAliases(query: IQuery): void {
    const aliasNumber = this._queryAliases.size + 1;
    const queryAlias = query.entity.adapter.relation.reduce((alias, rel, index) => {
      alias[rel.relationName] = index === 0 ? `T$${aliasNumber}` : `T$${aliasNumber}_${Object.keys(alias).length + 1}`;
      return alias;
    }, {} as IQueryAlias);
    this._queryAliases.set(query, queryAlias);

    query.fields
      .filter((field) => !field.query)
      .reduce((aliases, field) => aliases.set(field, `F$${aliases.size + 1}`), this._fieldAliases);

    query.fields.forEach((field) => {
      if (field.query) {
        this._createAliases(field.query);
      }
    });
  }

  private _getSelect(query: IQuery): string {
    let sql = `SELECT`;

    if (query.args.first !== undefined) {
      sql += ` FIRST ${query.args.first}`;
    }

    if (query.args.skip !== undefined) {
      sql += ` SKIP ${query.args.skip}`;
    }

    sql += `\n${this._makeFields(query).join(",\n")}`;
    sql += `\n${this._makeFrom(query)}`;

    const sqlJoin = this._makeJoin(query).join("\n");
    if (sqlJoin) {
      sql += `\n${sqlJoin}`;
    }

    const sqlWhereEquals = this._makeWhereEquals(query).join("\n  AND ");
    if (sqlWhereEquals) {
      sql += `\nWHERE ${sqlWhereEquals}`;
    }

    console.log("===================");
    console.log("QUERY:");
    console.log(query);
    console.log("SQL:");
    console.log(sql);
    console.log("PARAMS:");
    console.log(this._params);
    console.log("===================");
    return sql;
  }

  private _getDefinition(query: IQuery): any {
    const definition: any = {};

    query.fields.reduce((def, field) => {
      if (!field.query) {
        def[field.selectionValue] = {column: this._getFieldAlias(field)};
      }
      return def;
    }, definition);

    query.fields.reduce((def, field) => {
      if (field.query) {
        def[field.selectionValue] = field.isArray
          ? [this._getDefinition(field.query)]
          : this._getDefinition(field.query);
      }
      return def;
    }, definition);

    return definition;
  }

  private _makeFields(query: IQuery): string[] {
    const fields = query.fields
      .filter((field) => !field.query)
      .map((field) => {
        const adapter = field.attribute.adapter;
        return ERQueryExecutor._fieldTemplate(
          this._getTableAlias(query, adapter && (adapter as any).relation),
          this._getFieldAlias(field),
          this._getFieldName(field.attribute)
        );
      });

    const joinedFields = query.fields
      .filter((field) => field.query)
      .reduce((items, field) => {
        return items.concat(this._makeFields(field.query!));
      }, [] as string[]);

    return fields.concat(joinedFields);
  }

  private _makeFrom(query: IQuery): string {
    return query.entity.adapter.relation.reduce((from, rel, index) => {
      if (index === 0) {
        from.push(ERQueryExecutor._fromTemplate(this._getTableAlias(query), rel.relationName));
      } else {
        const relation = this._context.dbStructure.findRelation((item) => item.name === rel.relationName);
        if (relation && relation.primaryKey) {
          from.push(ERQueryExecutor._joinTemplate(
            rel.relationName,
            this._getTableAlias(query, rel.relationName),
            relation.primaryKey.fields[0],
            this._getTableAlias(query),
            this._getPrimaryKey(query).name
          ));
        }
      }
      return from;
    }, [] as any[]).join("\n");
  }

  private _makeJoin(query: IQuery): string[] {
    const alias = this._getTableAlias(query);
    return query.fields.reduce((joins, field) => {
      if (field.query) {
        joins.push(
          ERQueryExecutor._joinTemplate(
            field.query.entity.adapter.relation[0].relationName,
            this._getTableAlias(field.query),
            this._getFieldName(this._getPrimaryKey(field.query)),
            alias,
            this._getFieldName(field.attribute)
          )
        );
        joins.concat(this._makeJoin(field.query));
      }
      return joins;
    }, [] as string[]);
  }

  private _makeWhereEquals(query: IQuery): string[] {
    const alias = this._getTableAlias(query);
    const mainRel = query.entity.adapter.relation[0];

    if (mainRel.selector) {
      return [
        ERQueryExecutor._equalTemplate(
          alias,
          mainRel.selector.field,
          this._addToParams(mainRel.selector.value)
        )
      ];
    }
    return [];
  }

  private _getPrimaryKey(query: IQuery): Attribute {
    if (query.entity.pk[0]) {
      return query.entity.pk[0];
    }
    return query.entity.attributes[Object.keys(query.entity.attributes)[0]];
  }

  private _getTableAlias(query: IQuery, relationName?: string): string {
    const alias = this._queryAliases.get(query);
    if (alias) {
      if (relationName) {
        return alias[relationName] || "";
      }
      const mainRel = query.entity.adapter.relation[0];
      return alias[mainRel.relationName] || "";
    }
    return "";
  }

  private _getFieldAlias(field: IQueryField): string {
    return this._fieldAliases.get(field) || "";
  }

  private _getFieldName(attribute: Attribute): string {
    const adapter = attribute.adapter;
    if (adapter) {
      return (adapter as any).field;
    }
    return attribute.name;
  }

  private _addToParams(value: any): string {
    const length = Object.keys(this._params).length;
    const placeholder = `P$${length + 1}`;
    this._params[placeholder] = value;
    return `:${placeholder}`;
  }

  private _clearVariables(): void {
    this._params = {};
    this._queryAliases.clear();
    this._fieldAliases.clear();
  }
}
