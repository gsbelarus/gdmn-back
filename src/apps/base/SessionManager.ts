import {EventEmitter} from "events";
import {AConnectionPool, ICommonConnectionPoolOptions} from "gdmn-db";
import StrictEventEmitter from "strict-event-emitter-types";
import {v1 as uuidV1} from "uuid";
import {ISessionEvents, Session} from "./Session";

export interface ISessionManagerEvents extends ISessionEvents {
  open: (session: Session) => void;
}

// TODO sharing tasks between sessions on one user
export class SessionManager {

  public readonly emitter: StrictEventEmitter<EventEmitter, ISessionManagerEvents> = new EventEmitter();

  private readonly _connectionPool: AConnectionPool<ICommonConnectionPoolOptions>;
  private readonly _sessions: Session[] = [];

  constructor(connectionPool: AConnectionPool<ICommonConnectionPoolOptions>) {
    this._connectionPool = connectionPool;
  }

  public includes(session: Session): boolean {
    return this._sessions.includes(session);
  }

  public async open(userKey: number): Promise<Session> {
    const uid = uuidV1().toUpperCase();
    const session = new Session({
      id: uid,
      userKey,
      connection: await this._connectionPool.get()
    });
    session.emitter.once("close", (s) => {
      this.emitter.emit("close", session);
      this._sessions.splice(this._sessions.indexOf(s), 1);
    });
    session.emitter.once("forceClose", (s) => {
      this.emitter.emit("forceClose", session);
      this._sessions.splice(this._sessions.indexOf(s), 1);
    });
    this._sessions.push(session);
    this.emitter.emit("open", session);
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
    const promise = this._sessions.map((session) => session.forceClose());
    await Promise.all(promise);
  }
}
