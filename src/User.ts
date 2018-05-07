import {Context, ISources} from "./Context";

export interface IAuthData {
  username: string;
  password: string;
}

export class User extends Context {

  private _token: string;

  constructor(sources: ISources, token: string) {
    super(sources);
    this._token = token;
  }

  public static async login(context: Context, token: string): Promise<User>;
  public static async login(context: Context, authData: IAuthData): Promise<User>;
  public static async login(context: Context, arg: any): Promise<User> {
    if (typeof arg === "string") {
      return new User(context.sources, arg);
    }
    return new User(context.sources, "token");
  }
}
