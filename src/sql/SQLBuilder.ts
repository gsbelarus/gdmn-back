import {INamedParams} from "gdmn-db";
import {Attribute, Attribute2FieldMap, DetailAttribute, DetailAttributeMap, Entity} from "gdmn-orm";
import {Context} from "../context/Context";
import {EntityQuery, IEntityQueryInspector} from "./models/EntityQuery";
import {EntityQueryField} from "./models/EntityQueryField";
import {IEntityQueryWhere} from "./models/EntityQueryOptions";
import {SQLTemplates} from "./SQLTemplates";

interface IEntityQueryAlias {
  [relationName: string]: string;
}

export class SQLBuilder {

  private readonly _context: Context;
  private readonly _query: EntityQuery;

  private _queryAliases = new Map<EntityQuery, IEntityQueryAlias>();
  private _fieldAliases = new Map<EntityQueryField, string>();

  private _params: any = {};

  constructor(context: Context, query: string);
  constructor(context: Context, query: IEntityQueryInspector);
  constructor(context: Context, query: EntityQuery);
  constructor(context: Context, query: any) {
    this._context = context;
    if (query instanceof EntityQuery) {
      this._query = query;
    } else if (typeof query === "object") {
      this._query = EntityQuery.inspectorToObject(context.erModel, query);
    } else {
      this._query = EntityQuery.deserialize(context.erModel, query);
    }
  }

  private static _arrayJoinWithBracket(array: string[], separator: string): string {
    if (array.length === 1) {
      return array.join(separator);
    } else if (array.length > 1) {
      return `(${array.join(separator)})`;
    }
    return "";
  }

  private static _getAttrAdapter(entity: Entity, attribute: Attribute): { relationName: string, fieldName: string } {
    let relationName = entity.adapter.relation[0].relationName;
    let fieldName = attribute.name;
    if (attribute.adapter) {
      if (attribute instanceof DetailAttribute) {
        const detailAdapter = attribute.adapter as DetailAttributeMap;
        relationName = detailAdapter.masterLinks[0].detailRelation;
        fieldName = detailAdapter.masterLinks[0].link2masterField;

      } else {
        const attrAdapter = attribute.adapter as Attribute2FieldMap;
        relationName = attrAdapter.relation;
        fieldName = attrAdapter.field;
      }
    }

    return {relationName, fieldName};
  }

  private static _getPrimaryAttribute(query: EntityQuery): Attribute {
    if (query.entity.pk[0]) {
      return query.entity.pk[0];
    }
    return query.entity.attributes[Object.keys(query.entity.attributes)[0]];
  }

  public build(): { sql: string, params: INamedParams, fieldAliases: Map<EntityQueryField, string> } {
    this._clearVariables();
    this._createAliases(this._query);

    return {
      sql: this._getSelect(this._query),
      params: this._params,
      fieldAliases: this._fieldAliases
    };
  }

  private _createAliases(query: EntityQuery): void {
    const aliasNumber = this._queryAliases.size + 1;
    const queryAlias = query.entity.adapter.relation.reduce((alias, rel, index) => {
      alias[rel.relationName] = index === 0 ? `E$${aliasNumber}` : `E$${aliasNumber}_${Object.keys(alias).length + 1}`;
      return alias;
    }, {} as IEntityQueryAlias);
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

  private _getSelect(query: EntityQuery): string {
    let sql = `SELECT`;

    if (query.options && query.options.first !== undefined) {
      sql += ` FIRST ${this._addToParams(query.options.first)}`;
    }

    if (query.options && query.options.skip !== undefined) {
      sql += ` SKIP ${this._addToParams(query.options.skip)}`;
    }

    sql += `\n${this._makeFields(query).join(",\n")}`;
    sql += `\n${this._makeFrom(query)}`;

    const sqlJoin = this._makeJoin(query).join("\n");
    if (sqlJoin) {
      sql += `\n${sqlJoin}`;
    }

    const sqlWhere = this._makeWhereEntityConditions(query)
      .concat(this._makeWhereConditions(query))
      .join("\n  AND ");
    if (sqlWhere) {
      sql += `\nWHERE ${sqlWhere}`;
    }

    const sqlOrder = this._makeOrder(query).join(", ");
    if (sqlOrder) {
      sql += `\nORDER BY ${sqlOrder}`;
    }

    // TODO remove logs in production
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

  private _makeFields(query: EntityQuery): string[] {
    const fields = query.fields
      .filter((field) => !field.query)
      .map((field) => {
        const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, field.attribute);
        return SQLTemplates.field(
          this._getTableAlias(query, attrAdapter.relationName),
          this._getFieldAlias(field),
          attrAdapter.fieldName
        );
      });

    const joinedFields = query.fields.reduce((items, field) => {
      if (field.query) {
        return items.concat(this._makeFields(field.query!));
      }
      return items;
    }, [] as string[]);

    return fields.concat(joinedFields);
  }

  private _makeFrom(query: EntityQuery): string {
    const primaryAttr = SQLBuilder._getPrimaryAttribute(query);
    const primaryAttrAdapter = SQLBuilder._getAttrAdapter(query.entity, primaryAttr);

    const mainRelation = query.entity.adapter.relation[0];
    const from = SQLTemplates.from(this._getTableAlias(query), mainRelation.relationName);
    const join = query.entity.adapter.relation.reduce((joins, rel, index) => {
      if (index) {
        if (this._isExistInQuery(query, rel.relationName)) {
          joins.push(SQLTemplates.join(
            rel.relationName,
            this._getTableAlias(query, rel.relationName),
            this._getPrimaryName(rel.relationName),
            this._getTableAlias(query),
            primaryAttrAdapter.fieldName
          ));
        }
      }
      return joins;
    }, [] as string[]);

    join.unshift(from);
    return join.join("\n");
  }

  private _makeJoin(query: EntityQuery): string[] {
    const primaryAttr = SQLBuilder._getPrimaryAttribute(query);
    const primaryAttrAdapter = SQLBuilder._getAttrAdapter(query.entity, primaryAttr);

    return query.fields.reduce((joins, field) => {
      if (field.query) {
        const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, field.attribute);
        const nestedPrimaryAttr = SQLBuilder._getPrimaryAttribute(field.query);
        const nestedPrimaryAttrAdapter = SQLBuilder._getAttrAdapter(field.query.entity, nestedPrimaryAttr);

        const mainRelation = field.query.entity.adapter.relation[0];
        if (field.attribute instanceof DetailAttribute) {   // TODO support for SetAttribute
          joins.push(
            SQLTemplates.join(
              mainRelation.relationName,
              this._getTableAlias(field.query, mainRelation.relationName),
              attrAdapter.fieldName,
              this._getTableAlias(query, attrAdapter.relationName),
              nestedPrimaryAttrAdapter.fieldName
            )
          );
        } else {
          joins.push(
            SQLTemplates.join(
              mainRelation.relationName,
              this._getTableAlias(field.query, mainRelation.relationName),
              nestedPrimaryAttrAdapter.fieldName,
              this._getTableAlias(query, attrAdapter.relationName),
              attrAdapter.fieldName
            )
          );
        }
        field.query.entity.adapter.relation.reduce((relJoins, rel, index) => {
          if (index && field.query) {
            if (this._isExistInQuery(field.query, rel.relationName)) {
              relJoins.push(
                SQLTemplates.join(
                  rel.relationName,
                  this._getTableAlias(field.query, rel.relationName),
                  this._getPrimaryName(rel.relationName),
                  this._getTableAlias(field.query),
                  primaryAttrAdapter.fieldName
                )
              );
            }
          }
          return relJoins;
        }, joins);

        return joins.concat(this._makeJoin(field.query));
      }
      return joins;
    }, [] as string[]);
  }

  private _makeWhereEntityConditions(query: EntityQuery): string[] {
    const whereEquals = query.entity.adapter.relation.reduce((equals, rel) => {
      if (rel.selector) {
        if (this._isExistInQuery(query, rel.relationName)) {
          equals.push(
            SQLTemplates.equals(
              this._getTableAlias(query, rel.relationName),
              rel.selector.field,
              this._addToParams(rel.selector.value)
            )
          );
        }
      }
      return equals;
    }, [] as string[]);

    return query.fields.reduce((equals, field) => {
      if (field.query) {
        return equals.concat(this._makeWhereEntityConditions(field.query));
      }
      return equals;
    }, whereEquals);
  }

  private _makeWhereConditions(query: EntityQuery): string[] {
    const filters = [];

    if (query.options) {
      const filter = SQLBuilder._arrayJoinWithBracket(this._createSQLFilters(query, query.options.where), " AND ");
      if (filter) {
        filters.push(filter);
      }
    }

    return query.fields.reduce((items, field) => {
      if (field.query) {
        const conditions = this._makeWhereConditions(field.query);
        return items.concat(conditions);
      }
      return items;
    }, filters);
  }

  private _makeOrder(query: EntityQuery): string[] {
    const orders = [];
    if (query.options && query.options.order) {
      for (const [key, value] of query.options.order.entries()) {
        const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, key);
        const alias = this._getTableAlias(query, attrAdapter.relationName);

        orders.push(SQLTemplates.order(alias, attrAdapter.fieldName, value.toUpperCase()));
      }
    }
    return query.fields.reduce((items, field) => {
      if (field.query) {
        return items.concat(this._makeOrder(field.query));
      }
      return items;
    }, orders);
  }

  private _createSQLFilters(query: EntityQuery, where?: IEntityQueryWhere): string[] {
    if (!where) {
      return [];
    }
    const {isNull, equals, greater, less, and, or, not} = where;

    const filters = [];
    if (isNull) {
      const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, isNull);
      const alias = this._getTableAlias(query, attrAdapter.relationName);
      filters.push(SQLTemplates.isNull(alias, attrAdapter.fieldName));
    }
    if (equals) {
      const equalsFilters = [];
      for (const [attribute, value] of equals.entries()) {
        const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, attribute);
        const alias = this._getTableAlias(query, attrAdapter.relationName);
        equalsFilters.push(SQLTemplates.equals(alias, attrAdapter.fieldName, this._addToParams(value)));
      }
      const equalsFilter = SQLBuilder._arrayJoinWithBracket(equalsFilters, " AND ");
      if (equalsFilter) {
        filters.push(equalsFilter);
      }
    }
    if (greater) {
      const greaterFilters = [];
      for (const [attribute, value] of greater.entries()) {
        const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, attribute);
        const alias = this._getTableAlias(query, attrAdapter.relationName);
        greaterFilters.push(SQLTemplates.greater(alias, attrAdapter.fieldName, this._addToParams(value)));
      }
      const greaterFilter = SQLBuilder._arrayJoinWithBracket(greaterFilters, " AND ");
      if (greaterFilter) {
        filters.push(greaterFilter);
      }
    }
    if (less) {
      const lessFilters = [];
      for (const [attribute, value] of less.entries()) {
        const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, attribute);
        const alias = this._getTableAlias(query, attrAdapter.relationName);
        lessFilters.push(SQLTemplates.less(alias, attrAdapter.fieldName, this._addToParams(value)));
      }
      const lessFilter = SQLBuilder._arrayJoinWithBracket(lessFilters, " AND ");
      if (lessFilter) {
        filters.push(lessFilter);
      }
    }

    const notFilter = SQLBuilder._arrayJoinWithBracket(this._createSQLFilters(query, not), " AND ");
    if (notFilter) {
      filters.push(`NOT ${notFilter}`);
    }
    const andFilter = SQLBuilder._arrayJoinWithBracket(this._createSQLFilters(query, and), " AND ");
    if (andFilter) {
      filters.push(andFilter);
    }
    const orFilter = SQLBuilder._arrayJoinWithBracket(this._createSQLFilters(query, or), " OR ");
    if (orFilter) {
      filters.push(orFilter);
    }

    return filters;
  }

  private _getPrimaryName(relationName: string): string {
    const relation = this._context.dbStructure.findRelation((item) => item.name === relationName);
    if (relation && relation.primaryKey) {
      return relation.primaryKey.fields[0];
    }
    return "";
  }

  private _getTableAlias(query: EntityQuery, relationName?: string): string {
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

  private _getFieldAlias(field: EntityQueryField): string {
    return this._fieldAliases.get(field) || "";
  }

  private _isExistInQuery(query: EntityQuery, relationName: string): boolean {
    const existInFields = query.fields.some((field) => {
      const attrAdapter = SQLBuilder._getAttrAdapter(query.entity, field.attribute);
      return attrAdapter.relationName === relationName;
    });
    if (existInFields) {
      return true;
    }

    const where = query.options && query.options.where;
    if (where) {
      if ((where.isNull && SQLBuilder._getAttrAdapter(query.entity, where.isNull).relationName === relationName)
        || this._checkInAttrMap(query.entity, relationName, where.equals)
        || this._checkInAttrMap(query.entity, relationName, where.greater)
        || this._checkInAttrMap(query.entity, relationName, where.less)) {
        return true;
      }
    }

    if (this._checkInAttrMap(query.entity, relationName, query.options && query.options.order)) {
      return true;
    }
    return false;
  }

  private _checkInAttrMap(entity: Entity, relationName: string, map?: Map<Attribute, any>): boolean {
    if (map) {
      for (const key of map.keys()) {
        if (SQLBuilder._getAttrAdapter(entity, key).relationName === relationName) {
          return true;
        }
      }
    }
    return false;
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
