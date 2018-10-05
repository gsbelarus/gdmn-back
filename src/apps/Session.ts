import config from "config";
import {AConnection} from "gdmn-db";
import {endStatuses} from "./task/Task";
import {TaskManager} from "./task/TaskManager";

export type CloseListener = (session: Session) => void;

export interface IOptions {
  readonly id: string;
  readonly userKey: number;
  readonly timeout?: number;
  readonly connection: AConnection;
}

export class Session {

  private static DEFAULT_TIMEOUT: number = config.get("auth.session.timeout");

  private readonly _options: IOptions;
  private readonly _closeListener: CloseListener;
  private readonly _taskList = new TaskManager();

  private _borrowed: boolean = false;
  private _timer?: NodeJS.Timer;

  constructor(options: IOptions, closeListener: CloseListener) {
    this._options = options;
    this._closeListener = closeListener;
    this.initTimer();
  }

  get id(): string {
    return this._options.id;
  }

  get userKey(): number {
    return this._options.userKey;
  }

  get timeout(): number {
    return this._options.timeout || Session.DEFAULT_TIMEOUT;
  }

  get connection(): AConnection {
    return this._options.connection;
  }

  get active(): boolean {
    return this._options.connection.connected;
  }

  get taskList(): TaskManager {
    return this._taskList;
  }

  public borrow(): void {
    if (this._borrowed) {
      throw new Error("Session already borrowed");
    }
    this._borrowed = true;
    this.clearTimer();
  }

  public release(): void {
    if (!this._borrowed) {
      throw new Error("Session already released");
    }
    this._borrowed = false;
    this.initTimer();
  }

  public async close(): Promise<void> {
    this.clearTimer();
    this._closeListener(this);
    this._taskList.getAll().forEach((task) => {
      if (task.options.session === this && !endStatuses.includes(task.status)) {
        task.interrupt();
      }
    });
    this._taskList.clear();
    await this._options.connection.disconnect();
  }

  private initTimer(): void {
    this.clearTimer();
    this._timer = setInterval(() => {
      if (!this._taskList.size()) {
        this.close().catch(console.error);
      }
    }, Session.DEFAULT_TIMEOUT);
  }

  private clearTimer(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }
}
