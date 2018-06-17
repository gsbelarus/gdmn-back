import {AConnectionPool, DBStructure, IDefaultConnectionPoolOptions} from "gdmn-db";
import {ERModel} from "gdmn-orm";
import {ERGraphQLSchema} from "../graphql/ERGraphQLSchema";
import {Context, IDBDetail} from "./Context";
import {User} from "./User";

export abstract class ContextWrapper extends Context {

  private readonly _context: Context;

  protected constructor(context: Context) {
    super();
    this._context = context;
  }

  get context(): Context {
    return this._context;
  }

  get dbDetail(): IDBDetail {
    return this._context.dbDetail;
  }

  get dbStructure(): DBStructure {
    return this._context.dbStructure;
  }

  get connectionPool(): AConnectionPool<IDefaultConnectionPoolOptions> {
    return this._context.connectionPool;
  }

  get erModel(): ERModel {
    return this._context.erModel;
  }

  get erGraphQLSchema(): ERGraphQLSchema {
    return this._context.erGraphQLSchema;
  }

  get users(): User[] {
    return this._context.users;
  }
}
