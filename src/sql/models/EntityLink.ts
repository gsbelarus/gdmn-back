import {Entity, ERModel} from "gdmn-orm";
import {EntityQueryField, IEntityQueryFieldInspector} from "./EntityQueryField";

export interface IEntitySubQueryInspector {
  entity: string;
  alias: string;
  fields: IEntityQueryFieldInspector[];
}

export class EntityLink {

  public entity: Entity;
  public alias: string;
  public fields: EntityQueryField[];

  constructor(entity: Entity, alias: string, fields: EntityQueryField[]) {
    this.entity = entity;
    this.alias = alias;
    this.fields = fields;
  }

  public static deserialize(erModel: ERModel, text: string): EntityLink {
    return EntityLink.inspectorToObject(erModel, JSON.parse(text));
  }

  public static inspectorToObject(erModel: ERModel, inspector: IEntitySubQueryInspector): EntityLink {
    const entity = erModel.entity(inspector.entity);
    const alias = inspector.alias;
    const fields = inspector.fields.map((inspectorField) => (
      EntityQueryField.inspectorToObject(erModel, entity, inspectorField)
    ));

    return new EntityLink(entity, alias, fields);
  }

  public serialize(): string {
    return JSON.stringify(this.inspect());
  }

  public inspect(): IEntitySubQueryInspector {
    return {
      entity: this.entity.name,
      alias: this.alias,
      fields: this.fields.map((field) => field.inspect())
    };
  }
}
