import {AccessMode, AConnection} from "gdmn-db";
import {Attribute} from "gdmn-orm";
import {default as NestHydrationJS} from "nesthydrationjs";
import {Context} from "../Context";
import {IQuery, IQueryField} from "./ERQueryAnalyzer";

export class ERQueryExecutor {

  private _context: Context;

  private _queryAliases = new Map<IQuery, string>();
  private _fieldAliases = new Map<IQueryField, string>();

  private _params: any = {};

  constructor(context: Context) {
    this._context = context;
  }

  public async execute(query: IQuery): Promise<any> {
    this._clearVariables();
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

  private _createAliases(query: IQuery): void {
    this._queryAliases.set(query, `T$${this._queryAliases.size + 1}`);

    query.fields
      .filter((field) => !field.query)
      .reduce((aliases, field) => aliases.set(field, `F$${aliases.size + 1}`), this._fieldAliases);

    query.fields
      .filter((field) => field.query)
      .forEach((field) => this._createAliases(field.query!));
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
    sql += `\nFROM ${this._makeFrom(query)}`;

    const sqlJoin = this._makeJoin(query).join(",\n");
    if (sqlJoin) {
      sql += `\n${sqlJoin}`;
    }

    const sqlWhere = this._makeWhere(query);
    if (sqlWhere) {
      sql += `\nWHERE ${sqlWhere}`;
    }

    console.log("===================");
    console.log(query);
    console.log(sql);
    console.log(this._params);
    console.log("===================");
    return sql;
  }

  private _getDefinition(query: IQuery): any {
    const definition: any = {};
    const alias = this._getTableAlias(query);

    const primaryAttribute = query.entity.pk[0];
    if (!query.fields.some((field) => field.attribute === primaryAttribute)) {
      definition[primaryAttribute.name] = {column: this._getPrimaryKeyAlias(primaryAttribute, alias)};
    }

    query.fields
      .filter((field) => !field.query)
      .reduce((def, field) => {
        def[field.selectionValue] = {column: this._getFieldAlias(field)};
        return def;
      }, definition);

    query.fields
      .filter((field) => field.query)
      .reduce((def, field) => {
        def[field.selectionValue] = field.isArray
          ? [this._getDefinition(field.query!)]
          : this._getDefinition(field.query!);
        return def;
      }, definition);

    return definition;
  }

  private _makeFields(query: IQuery): string[] {
    const alias = this._getTableAlias(query);
    const template = (fieldName: string, fieldAlias: string) => (
      `  ${alias && `${alias}.`}${fieldName} AS ${fieldAlias}`
    );

    const fields = query.fields
      .filter((field) => !field.query)
      .map((field) => template(field.attribute.name, this._getFieldAlias(field)));

    const joinedFields = query.fields
      .filter((field) => field.query)
      .reduce((items, field) => {
        return items.concat(this._makeFields(field.query!));
      }, [] as string[]);

    const primaryAttribute = query.entity.pk[0];
    if (!query.fields.some((item) => item.attribute === primaryAttribute)) {
      fields.unshift(template(primaryAttribute.name, this._getPrimaryKeyAlias(primaryAttribute, alias)));
    }
    return fields.concat(joinedFields);
  }

  private _makeFrom(query: IQuery): string {
    const mainRelation = query.entity.adapter.relation[0];

    return `${mainRelation.relationName} ${this._getTableAlias(query)}`;
  }

  private _makeJoin(query: IQuery): string[] {
    const alias = this._getTableAlias(query);
    const template = (joinRelationName: string, joinAlias: string, joinFieldName: string, fieldName: string) => (
      ` LEFT JOIN ${joinRelationName} ${joinAlias} ` +
      `ON ${joinAlias && `${joinAlias}.`}${joinFieldName} = ${alias && `${alias}.`}${fieldName}`
    );
    return query.fields
      .filter((field) => field.query)
      .map((field) => {
        const joinAlias = this._getTableAlias(field.query);
        const joinEntity = field.query!.entity;
        return template(
          joinEntity.adapter.relation[0].relationName,
          joinAlias,
          joinEntity.pk[0].name,
          field.attribute.name
        );
      });
  }

  private _makeWhere(query: IQuery): string {
    const alias = this._getTableAlias(query);
    const mainRel = query.entity.adapter.relation[0];

    if (mainRel.selector) {
      return `${alias && `${alias}.`}${mainRel.selector.field} = :${this._addToParams(mainRel.selector.value)}`;
    }
    return "";
  }

  private _getPrimaryKeyAlias(attribute: Attribute, alias?: string): string {
    return `${alias && `${alias}_`}${attribute.name}`;
  }

  private _getTableAlias(query?: IQuery): string {
    if (query) {
      return this._queryAliases.get(query) || "";
    }
    return "";
  }

  private _getFieldAlias(field: IQueryField): string {
    return this._fieldAliases.get(field) || "";
  }

  private _addToParams(value: any): string {
    const length = Object.keys(this._params).length;
    const placeholder = `param_${length}`;
    this._params[placeholder] = value;
    return placeholder;
  }

  private _clearVariables(): void {
    this._params = {};
    this._queryAliases.clear();
    this._fieldAliases.clear();
  }
}
