import {Attribute} from "gdmn-orm";
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

  public inspect(): IEntityQueryFieldInspector {
    return {
      attribute: this.attribute.name,
      query: this.query && this.query.inspect()
    };
  }
}
