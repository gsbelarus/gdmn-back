import {AccessMode, AConnection, AConnectionPool} from "gdmn-db";
import {default as NestHydrationJS, IDefinition} from "nesthydrationjs";
import {Context} from "../Context";
import {IQuery} from "./ERQueryAnalyzer";

export class ERQueryExecutor {

  private _context: Context;

  private _sql: string = "";
  private _params: any = {};
  private _definition: IDefinition = {};

  constructor(context: Context) {
    this._context = context;
  }

  public async execute(query: IQuery): Promise<any> {
    this._clearVariables();

    this._makeSelect(query);
    this._makeDefinitions(query);

    return AConnectionPool.executeConnection({
      connectionPool: this._context.connectionPool,
      callback: (connection) => AConnection.executeTransaction({
        connection, options: {
          accessMode: AccessMode.READ_ONLY
        },
        callback: (transaction) => {
          return AConnection.executeQueryResultSet({
            connection,
            transaction,
            sql: this._sql,
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
              return NestHydrationJS().nest(result, [this._definition]);
            }
          });
        }
      })
    });
  }

  private _makeSelect(query: IQuery): void {
    this._sql += `SELECT \n${this._makeFields(query).join(",\n")}`;
    this._sql += `\nFROM ${this._makeFrom(query)}`;

    const sqlJoin = this._makeJoin(query).join(",\n");
    if (sqlJoin) {
      this._sql += `\n${sqlJoin}`;
    }

    const sqlWhere = this._makeWhere(query);
    if (sqlWhere) {
      this._sql += `\nWHERE ${sqlWhere}`;
    }

    console.log("===================");
    console.log(this._sql);
    console.log(this._params);
    console.log("===================");
  }

  private _makeDefinitions(query: IQuery): void {
    const primaryAttribute = query.entity.pk[0];
    if (!query.fields.some((item) => item.attribute === primaryAttribute)) {
      this._definition[primaryAttribute.name] = {column: primaryAttribute.name};
    }

    query.fields.reduce((definition, field) => {
      definition[field.selectionValue] = {column: field.selectionValue};
      return definition;
    }, this._definition);
  }

  private _makeFields(query: IQuery, alias: string = ""): string[] {
    const template = (fieldName: string, fieldAlias: string) => (
      `  ${alias && `${alias}.`}${fieldName} AS ${fieldAlias}`
    );

    const fields = query.fields.map((item) => template(item.attribute.name, item.selectionValue));

    const primaryAttribute = query.entity.pk[0];
    if (!query.fields.some((item) => item.attribute === primaryAttribute)) {
      fields.unshift(template(primaryAttribute.name, primaryAttribute.name));
    }
    return fields;
  }

  private _makeFrom(query: IQuery, alias: string = ""): string {
    const mainRelation = query.entity.adapter.relation[0];

    return `${mainRelation.relationName} ${alias}`;
  }

  private _makeJoin(query: IQuery, alias: string = ""): string[] {
    return [];
  }

  private _makeWhere(query: IQuery, alias: string = ""): string {
    const mainRel = query.entity.adapter.relation[0];

    if (mainRel.selector) {
      return `${alias && `${alias}.`}${mainRel.selector.field} = :${this._addToParams(mainRel.selector.value)}`;
    }
    return "";
  }

  private _addToParams(value: any): string {
    const length = Object.keys(this._params).length;
    const placeholder = `param_${length}`;
    this._params[placeholder] = value;
    return placeholder;
  }

  private _clearVariables(): void {
    this._sql = "";
    this._params = {};
    this._definition = {};
  }
}
