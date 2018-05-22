import {Attribute} from "gdmn-orm";
import {EntityQuery, IEntityQueryInspector} from "./EntityQuery";

export interface IEntityQueryFieldInspector {
  attribute: string;
  query?: IEntityQueryInspector;
}

export class EntityQueryField {

  private readonly _attribute: Attribute;
  private readonly _query?: EntityQuery;

  constructor(attribute: Attribute, query?: EntityQuery) {
    this._attribute = attribute;
    this._query = query;
  }

  get attribute(): Attribute {
    return this._attribute;
  }

  get query(): EntityQuery | undefined {
    return this._query;
  }

  public inspect(): IEntityQueryFieldInspector {
    return {
      attribute: this._attribute.name,
      query: this._query && this._query.inspect()
    };
  }
}
