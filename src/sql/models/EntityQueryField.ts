import {Attribute, Entity, ERModel} from "gdmn-orm";
import {EntityQuery, IEntityQueryInspector} from "./EntityQuery";

export interface IEntityQueryFieldInspector {
  attribute: string;
  query?: IEntityQueryInspector;
}

export class EntityQueryField {

  public attribute: Attribute;
  public query?: EntityQuery;

  constructor(attribute: Attribute, query?: EntityQuery) {
    this.attribute = attribute;
    this.query = query;
  }

  public static inspectorToObject(erModel: ERModel,
                                  entity: Entity,
                                  inspector: IEntityQueryFieldInspector): EntityQueryField {
    return new EntityQueryField(entity.attribute(inspector.attribute),
      inspector.query && EntityQuery.inspectorToObject(erModel, inspector.query));
  }

  public inspect(): IEntityQueryFieldInspector {
    return {
      attribute: this.attribute.name,
      query: this.query && this.query.inspect()
    };
  }
}
