import config from "config";
import {AConnection} from "gdmn-db";
import {endStatuses, TaskStatus} from "./task/Task";
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
  private static CLOSE_CHECK_INTERVAL: number = config.get("auth.session.closeCheckInterval");

  private readonly _options: IOptions;
  private readonly _closeListener: CloseListener;
  private readonly _taskManager = new TaskManager();

  private _softClosed: boolean = false;
  private _closed: boolean = false;
  private _borrowed: boolean = false;
  private _timer?: NodeJS.Timer;

  constructor(options: IOptions, closeListener: CloseListener) {
    this._options = options;
    this._closeListener = closeListener;
    this._updateTimer();
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

  get softClosed(): boolean {
    return this._softClosed;
  }

  get active(): boolean {
    return this._options.connection.connected && !this._closed;
  }

  get taskManager(): TaskManager {
    return this._taskManager;
  }

  public borrow(): void {
    if (this._borrowed) {
      throw new Error("Session already borrowed");
    }
    this._borrowed = true;
    this._clearTimer();
  }

  public release(): void {
    if (!this._borrowed) {
      throw new Error("Session already released");
    }
    this._borrowed = false;
    this._updateTimer();
  }

  public softClose(): void {
    this._softClosed = true;
    this._closeListener(this);
    this._updateTimer();
    this._checkSoftClose();
  }

  public async close(): Promise<void> {
    if (this._closed) {
      throw new Error("Session already closed");
    }
    this._closed = true;
    this._clearTimer();
    this._closeListener(this);
    this._taskManager.getAll().forEach((task) => {
      if (task.options.session === this && !endStatuses.includes(task.status)) {
        task.interrupt();
      }
    });
    this._taskManager.clear();
    await this._options.connection.disconnect();
    console.log("Session is closed");
  }

  private _updateTimer(): void {
    this._clearTimer();
    this._timer = setInterval(() => {
      if (!this._checkSoftClose()) {
        this.softClose();
      }
    }, this._softClosed ? Session.CLOSE_CHECK_INTERVAL : Session.DEFAULT_TIMEOUT);
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private _checkSoftClose(): boolean {
    if (this._softClosed) {
      const runningTasks = this._taskManager
        .find(TaskStatus.RUNNING)
        .filter((task) => task.options.session === this);
      if (!runningTasks.length) {
        this.close().catch(console.error);
        return true;
      }
    }
    return false;
  }
}
