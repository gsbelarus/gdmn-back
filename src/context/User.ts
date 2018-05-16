import {Context} from "./Context";
import {ContextWrapper} from "./ContextWrapper";

export interface IAuthData {
  username: string;
  password: string;
}

export class User extends ContextWrapper {

  private readonly _token: string;

  protected constructor(context: Context, token: string) {
    super(context);
    this._token = token;
    this.users.push(this);
  }

  get token(): string {
    return this._token;
  }

  public static async login(context: Context, token: string): Promise<User>;
  public static async login(context: Context, authData: IAuthData): Promise<User>;
  public static async login(context: Context, arg: any): Promise<User> {
    if (typeof arg === "string") {
      let user: User | undefined;
      user = context.users.find((item) => item.token === arg);
      if (user) {
        return user;
      }
      throw new Error("User not found");
    }
    return new User(context, `token$${context.users.length + 1}`);
  }

  public static async logout(user: User): Promise<void> {
    user.users.splice(user.users.indexOf(user), 1);
  }
}
