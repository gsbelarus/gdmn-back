import {StompHeaders} from "node-stomp-protocol";
import {Application} from "../apps/Application";
import {MainApplication} from "../apps/MainApplication";
import {createAccessJwtToken, createRefreshJwtToken, getPayloadFromJwtToken} from "../passport";

export interface ITokens extends StompHeaders {
  "access-token": string;
  "refresh-token": string;
}

export class Utils {

  public static checkContentType(headers?: StompHeaders): void | never {
    const contentType = headers!["content-type"];
    if (contentType !== "application/json;charset=utf-8") {
      throw new Error(`Unsupported content-type '${contentType}'; supported - 'application/json;charset=utf-8'`);
    }
  }

  public static async getApplication(mainApplication: MainApplication,
                                     userKey: number,
                                     uid?: string): Promise<Application> {
    if (uid) {
      // auth on main and get application
      let session = mainApplication.sessionManager.get(userKey);
      if (!session) {
        session = await mainApplication.sessionManager.open(userKey, 1000);
      }
      session.borrow();
      try {
        return await mainApplication.getApplication(uid, session);
      } finally {
        session.release();
      }
    } else {
      // use main as application
      return mainApplication;
    }
  }

  public static async authorize(mainApplication: MainApplication,
                                token: string): Promise<{ userKey: number, newTokens?: ITokens }> {
    const payload = getPayloadFromJwtToken(token);
    const user = await mainApplication.findUser({id: payload.id});
    if (!user) {
      throw new Error("No users for token");
    }
    const result: { userKey: number, newTokens?: ITokens } = {userKey: user.id};
    if (payload.isRefresh) {
      result.newTokens = {
        "access-token": createAccessJwtToken(user),
        "refresh-token": createRefreshJwtToken(user)
      };
    }
    return result;
  }

  public static async login(mainApplication: MainApplication,
                            login: string,
                            password: string): Promise<{ userKey: number, newTokens: ITokens }> {
    const user = await mainApplication.checkUserPassword(login, password);
    if (!user) {
      throw new Error("Incorrect login or password");
    }
    return {
      userKey: user.id,
      newTokens: {
        "access-token": createAccessJwtToken(user),
        "refresh-token": createRefreshJwtToken(user)
      }
    };
  }

  public static async createUser(mainApplication: MainApplication,
                                 login: string,
                                 password: string): Promise<{ userKey: number, newTokens: ITokens }> {
    const duplicate = await mainApplication.findUser({login});
    if (duplicate) {
      throw new Error("Login already exists");
    }
    const user = await mainApplication.addUser({
      login,
      password,
      admin: false
    });
    if (!user) {
      throw new Error("Unauthorized");
    }
    return {
      userKey: user.id,
      newTokens: {
        "access-token": createAccessJwtToken(user),
        "refresh-token": createRefreshJwtToken(user)
      }
    };
  }
}
