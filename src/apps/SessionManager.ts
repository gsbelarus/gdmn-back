import {AConnectionPool, ICommonConnectionPoolOptions} from "gdmn-db";
import {v1 as uuidV1} from "uuid";
import {Session} from "./Session";

export class SessionManager {

  private readonly _connectionPool: AConnectionPool<ICommonConnectionPoolOptions>;
  private readonly _sessions: Session[] = [];

  constructor(connectionPool: AConnectionPool<ICommonConnectionPoolOptions>) {
    this._connectionPool = connectionPool;
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

  public get(userKey: number): Session | undefined {
    return this._sessions.find((s) => s.userKey === userKey);
  }

  public async closeAll(): Promise<void> {
    const promise = this._sessions.map((session) => session.close());
    await Promise.all(promise);
  }
}
