import {AConnectionPool, ICommonConnectionPoolOptions} from "gdmn-db";
import {v1 as uuidV1} from "uuid";
import {Session} from "./Session";

// TODO sharing tasks between sessions on one user
export class SessionManager {

  private readonly _connectionPool: AConnectionPool<ICommonConnectionPoolOptions>;
  private readonly _sessions: Session[] = [];

  constructor(connectionPool: AConnectionPool<ICommonConnectionPoolOptions>) {
    this._connectionPool = connectionPool;
  }

  public includes(session: Session): boolean {
    return this._sessions.includes(session);
  }

  public async open(userKey: number, timeout?: number): Promise<Session> {
    const uid = uuidV1().toUpperCase();
    const session = new Session({
      id: uid,
      userKey,
      timeout,
      connection: await this._connectionPool.get()
    }, (s) => this._sessions.splice(this._sessions.indexOf(s), 1));
    this._sessions.push(session);
    return session;
  }

  public find(userKey: number): Session[];
  public find(session: string, userKey: number): Session | undefined;
  public find(param1: string | number, param2?: number): Session[] | Session | undefined {
    switch (typeof param1) {
      case "string":
        return this._sessions.find((session) => session.id === param1 && session.userKey === param2);
      case "number":
        return this._sessions.filter((session) => session.userKey === param1);
      default:
        throw new Error("Invalid arguments");
    }
  }

  public async closeAll(): Promise<void> {
    const promise = this._sessions.map((session) => session.close());
    await Promise.all(promise);
  }
}
