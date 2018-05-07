import {AccessMode, AConnection, AConnectionPool, ATransaction, Isolation} from "gdmn-db";
import NestHydrationJS from "nesthydrationjs";
import {Context} from "../Context";
import {IQuery} from "./ERQueryAnalyzer";

interface IDefinition {
  [key: string]: any;
}

export class ERQueryExecutor {

  private _context: Context;

  private _sql: string = "";
  private _params: any = {};
  private _definition: IDefinition = {};

  constructor(context: Context) {
    this._context = context;
  }

  public async execute(query: IQuery): Promise<any> {
    this.makeSelect(query);
    this.makeDefinitions(query);

    return AConnectionPool.executeConnection(this._context.connectionPool,
      (connection) => AConnection.executeTransaction(connection, {
        accessMode: AccessMode.READ_ONLY,
        isolation: Isolation.READ_COMMITED
      }, (transaction) => ATransaction.executeQueryResultSet(transaction, this._sql, this._params,
        async (resultSet) => {
          const result = [];
          while (await resultSet.next()) {
            // query.fields.reduce((object, field) => {
            //   let value: any | undefined;
            //   switch (field.attribute.constructor) {
            //     case StringAttribute:
            //       value = resultSet.getString();
            //   }
            //   return object;
            // }, {});
            result.push({
              ID: resultSet.getNumber(0),
              NAME: resultSet.getString(1)
            });
          }
          console.log(resultSet.position);
          return NestHydrationJS().nest(result, [this._definition]);
        })));
  }

  private makeSelect(query: IQuery): void {
    this._sql = "";
    this._params = {};

    this._sql += `SELECT \n${this.makeFields(query).join(",\n")}`;
    this._sql += `\nFROM ${this.makeFrom(query)}`;

    const sqlJoin = this.makeJoin(query).join(",\n");
    if (sqlJoin) {
      this._sql += `\n${sqlJoin}`;
    }

    const sqlWhere = this.makeWhere(query);
    if (sqlWhere) {
      this._sql += `\nWHERE ${sqlWhere}`;
    }

    console.log("===================");
    console.log(this._sql);
    console.log(this._params);
    console.log("===================");
  }

  private makeDefinitions(query: IQuery): void {
    const primaryAttribute = query.entity.pk[0];
    if (!query.fields.some((item) => item.attribute === primaryAttribute)) {
      this._definition[primaryAttribute.name] = {column: primaryAttribute.name};
    }

    query.fields.reduce((definition, field) => {
      definition[field.selectionValue] = {column: field.selectionValue};
      return definition;
    }, this._definition);
  }

  private makeFields(query: IQuery, alias: string = ""): string[] {
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

  private makeFrom(query: IQuery, alias: string = ""): string {
    const mainRelation = query.entity.adapter.relation[0];

    return `${mainRelation.relationName} ${alias}`;
  }

  private makeJoin(query: IQuery, alias: string = ""): string[] {
    return [];
  }

  private makeWhere(query: IQuery, alias: string = ""): string {
    const mainRel = query.entity.adapter.relation[0];

    if (mainRel.selector) {
      return `${alias && `${alias}.`}${mainRel.selector.field} = :${this.addToParams(mainRel.selector.value)}`;
    }
    return "";
  }

  private addToParams(value: any): string {
    const length = Object.keys(this._params).length;
    const placeholder = `param_${length}`;
    this._params[placeholder] = value;
    return placeholder;
  }
}
