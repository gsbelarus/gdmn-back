import {Attribute, Entity, ERModel} from "gdmn-orm";
import {EntityQuery, IEntityQueryInspector} from "./EntityQuery";

export interface IEntityQueryFieldInspector {
  attribute: string;
  query?: IEntityQueryInspector;
  setAttributes?: string[];
}

export class EntityQueryField {

  public attribute: Attribute;
  public query?: EntityQuery;
  public setAttributes?: Attribute[];

  constructor(attribute: Attribute, query?: EntityQuery, setAttributes?: Attribute[]) {
    this.attribute = attribute;
    this.query = query;
    this.setAttributes = setAttributes;
  }

  public static inspectorToObject(erModel: ERModel,
                                  entity: Entity,
                                  inspector: IEntityQueryFieldInspector): EntityQueryField {
    return new EntityQueryField(
      entity.attribute(inspector.attribute),
      inspector.query && EntityQuery.inspectorToObject(erModel, inspector.query),
      inspector.setAttributes && inspector.setAttributes.map((attr) => entity.attribute(attr))
    );
  }

  public inspect(): IEntityQueryFieldInspector {
    return {
      attribute: this.attribute.name,
      query: this.query && this.query.inspect(),
      setAttributes: this.setAttributes && this.setAttributes.map((attr) => attr.name)
    };
  }
}
