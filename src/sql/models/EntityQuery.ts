import {ERModel} from "gdmn-orm";
import {EntityLink, IEntitySubQueryInspector} from "./EntityLink";
import {EntityQueryOptions, IEntityQueryOptionsInspector} from "./EntityQueryOptions";

export interface IEntityQueryInspector {
  link: IEntitySubQueryInspector;
  options?: IEntityQueryOptionsInspector;
}

export class EntityQuery {

  public link: EntityLink;
  public options?: EntityQueryOptions;

  constructor(query: EntityLink, options?: EntityQueryOptions) {
    this.link = query;
    this.options = options;
  }

  public static deserialize(erModel: ERModel, text: string): EntityQuery {
    return EntityQuery.inspectorToObject(erModel, JSON.parse(text));
  }

  public static inspectorToObject(erModel: ERModel, inspector: IEntityQueryInspector): EntityQuery {
    const query = EntityLink.inspectorToObject(erModel, inspector.link);
    const options = inspector.options && EntityQueryOptions.inspectorToObject(query.entity, inspector.options);

    return new EntityQuery(query, options);
  }

  public inspect(): IEntityQueryInspector {
    const inspect: IEntityQueryInspector = {link: this.link.inspect()};
    if (this.options) {
      inspect.options = this.options.inspect();
    }
    return inspect;
  }
}
