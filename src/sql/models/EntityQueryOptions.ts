import {Attribute, Entity} from "gdmn-orm";

export interface IEntityQueryWhereInspector {
  not?: IEntityQueryWhereInspector;
  or?: IEntityQueryWhereInspector;
  and?: IEntityQueryWhereInspector;

  isNull?: string;
  equals?: { [fieldName: string]: any };
  greater?: { [fieldName: string]: any };
  less?: { [fieldName: string]: any };
}

export interface IEntityQueryOptionsInspector {
  first?: number;
  skip?: number;
  where?: IEntityQueryWhereInspector;
  order?: { [fieldName: string]: string };
}

export interface IEntityQueryWhere {
  not?: IEntityQueryWhere;
  or?: IEntityQueryWhere;
  and?: IEntityQueryWhere;

  isNull?: Attribute;
  equals?: Map<Attribute, any>;
  greater?: Map<Attribute, any>;
  less?: Map<Attribute, any>;
}

export enum EntityQueryOrder {
  ASC = "asc",
  DESC = "desc"
}

export class EntityQueryOptions {

  public first?: number;
  public skip?: number;
  public where?: IEntityQueryWhere;
  public order?: Map<Attribute, EntityQueryOrder>;

  constructor(first?: number,
              skip?: number,
              where?: IEntityQueryWhere,
              order?: Map<Attribute, EntityQueryOrder>) {
    this.first = first;
    this.skip = skip;
    this.where = where;
    this.order = order;
  }

  public static inspectorToObject(entity: Entity, inspector: IEntityQueryOptionsInspector): EntityQueryOptions {
    return new EntityQueryOptions(
      inspector.first,
      inspector.skip,
      EntityQueryOptions.inspectorWhereToObject(entity, inspector.where),
      EntityQueryOptions._inspectorToObjectMap(entity, inspector.order)
    );
  }

  private static inspectorWhereToObject(entity: Entity,
                                        inspector?: IEntityQueryWhereInspector): IEntityQueryWhere | undefined {
    if (inspector) {
      return {
        not: EntityQueryOptions.inspectorWhereToObject(entity, inspector.not),
        or: EntityQueryOptions.inspectorWhereToObject(entity, inspector.or),
        and: EntityQueryOptions.inspectorWhereToObject(entity, inspector.and),

        isNull: inspector.isNull ? entity.attribute(inspector.isNull) : undefined,
        equals: EntityQueryOptions._inspectorToObjectMap(entity, inspector.equals),
        greater: EntityQueryOptions._inspectorToObjectMap(entity, inspector.greater),
        less: EntityQueryOptions._inspectorToObjectMap(entity, inspector.less),
      };
    }
  }

  private static _inspectorToObjectMap(entity: Entity,
                                       map?: { [fieldName: string]: any }): Map<Attribute, any> | undefined {
    if (map) {
      return Object.entries(map)
        .reduce((newMap, [key, value]) => {
          newMap.set(entity.attribute(key), value);
          return newMap;
        }, new Map<Attribute, any>());
    }
  }

  private static _inspectMap(map?: Map<Attribute, any>): { [fieldName: string]: any } | undefined {
    if (map) {
      const newMap: { [fieldName: string]: any } = {};
      for (const [key, value] of map.entries()) {
        newMap[key.name] = value;
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

        isNull: where.isNull && where.isNull.name,
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
