import {EntityQueryField, IEntityQueryFieldInspector} from "./EntityQueryField";

export interface IEntityQueryWhereInspector {
  not?: IEntityQueryWhereInspector;
  or?: IEntityQueryWhereInspector;
  and?: IEntityQueryWhereInspector;

  isNull?: IEntityQueryFieldInspector;
  equals?: Map<IEntityQueryFieldInspector, any>;
  greater?: Map<IEntityQueryFieldInspector, any>;
  less?: Map<IEntityQueryFieldInspector, any>;
}

export interface IEntityQueryOptionsInspector {
  first?: number;
  skip?: number;
  where?: IEntityQueryWhereInspector;
  order?: Map<IEntityQueryFieldInspector, string>;
}

export interface IEntityQueryWhere {
  not?: IEntityQueryWhere;
  or?: IEntityQueryWhere;
  and?: IEntityQueryWhere;

  isNull?: EntityQueryField;
  equals?: Map<EntityQueryField, any>;
  greater?: Map<EntityQueryField, any>;
  less?: Map<EntityQueryField, any>;
}

export enum EntityQueryOrder {
  ASC = "asc",
  DESC = "desc"
}

export class EntityQueryOptions {

  public first?: number;
  public skip?: number;
  public where?: IEntityQueryWhere;
  public order?: Map<EntityQueryField, EntityQueryOrder>;

  constructor(first?: number,
              skip?: number,
              where?: IEntityQueryWhere,
              order?: Map<EntityQueryField, EntityQueryOrder>) {
    this.first = first;
    this.skip = skip;
    this.where = where;
    this.order = order;
  }

  private static _inspectMap(map?: Map<EntityQueryField, any>): Map<IEntityQueryFieldInspector, any> | undefined {
    if (map) {
      const newMap = new Map<IEntityQueryFieldInspector, any>();
      for (const [key, value] of map.entries()) {
        newMap.set(key.inspect(), value);
      }
      return newMap;
    }
  }

  private static _inspectWhere(where?: IEntityQueryWhere): IEntityQueryWhereInspector | undefined {
    if (where) {
      return {
        not: this._inspectWhere(where.not),
        or: this._inspectWhere(where.or),
        and: this._inspectWhere(where.and),

        isNull: where.isNull && where.isNull.inspect(),
        equals: EntityQueryOptions._inspectMap(where.equals),
        greater: EntityQueryOptions._inspectMap(where.greater),
        less: EntityQueryOptions._inspectMap(where.less)
      };
    }
  }

  public inspect(): IEntityQueryOptionsInspector {
    return {
      first: this.first,
      skip: this.skip,
      where: EntityQueryOptions._inspectWhere(this.where),
      order: EntityQueryOptions._inspectMap(this.order)
    };
  }
}
