import {Entity, ERModel} from "gdmn-orm";
import {EntityQueryField, IEntityQueryFieldInspector} from "./EntityQueryField";
import {EntityQueryOptions, IEntityQueryOptionsInspector} from "./EntityQueryOptions";

export interface IEntityQueryInspector {
  entity: string;
  fields: IEntityQueryFieldInspector[];
  options?: IEntityQueryOptionsInspector;
}

export class EntityQuery {

  public entity: Entity;
  public fields: EntityQueryField[];
  public options?: EntityQueryOptions;

  constructor(entity: Entity, fields: EntityQueryField[], options?: EntityQueryOptions) {
    this.entity = entity;
    this.fields = fields;
    this.options = options;
  }

  public static deserialize(erModel: ERModel, text: string): EntityQuery {
    return EntityQuery._deserialize(erModel, JSON.parse(text));
  }

  private static _deserialize(erModel: ERModel, inspector: IEntityQueryInspector): EntityQuery {
    const entity = erModel.entity(inspector.entity);
    const fields = inspector.fields.map((field) => (
      new EntityQueryField(entity.attribute(field.attribute), field.query && this._deserialize(erModel, field.query))
    ));
    return new EntityQuery(entity, fields);
  }

  public serialize(): string {
    return JSON.stringify(this.inspect());
  }

  public inspect(): IEntityQueryInspector {
    return {
      entity: this.entity.name,
      fields: this.fields.map((field) => field.inspect()),
      options: this.options && this.options.inspect()
    };
  }
}
