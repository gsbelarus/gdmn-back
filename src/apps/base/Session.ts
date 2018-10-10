import config from "config";
import {EventEmitter} from "events";
import {AConnection} from "gdmn-db";
import StrictEventEmitter from "strict-event-emitter-types";
import {endStatuses, TaskStatus} from "./task/Task";
import {TaskManager} from "./task/TaskManager";

export interface IOptions {
  readonly id: string;
  readonly userKey: number;
  readonly connection: AConnection;
}

export interface ISessionEvents {
  close: (session: Session) => void;
  forceClose: (session: Session) => void;
}

export class Session {

  private static DEFAULT_TIMEOUT: number = config.get("auth.session.timeout");

  public readonly emitter: StrictEventEmitter<EventEmitter, ISessionEvents> = new EventEmitter();

  private readonly _options: IOptions;
  private readonly _taskManager = new TaskManager();

  private _closed: boolean = false;
  private _forceClosed: boolean = false;
  private _timer?: NodeJS.Timer;

  constructor(options: IOptions) {
    this._options = options;
    console.log(`Session (id#${this.id}) is opened`);
  }

  get id(): string {
    return this._options.id;
  }

  get userKey(): number {
    return this._options.userKey;
  }

  get connection(): AConnection {
    return this._options.connection;
  }

  get closed(): boolean {
    return this._closed;
  }

  get active(): boolean {
    return this._options.connection.connected && !this._forceClosed;
  }

  get taskManager(): TaskManager {
    return this._taskManager;
  }

  public setCloseTimeout(timeout: number = Session.DEFAULT_TIMEOUT): void {
    this.clearCloseTimeout();
    console.log(`Session (id#${this.id}) is lost and will be closed after ${timeout / (60 * 1000)} minutes`);
    this._timer = setTimeout(() => this.close(), timeout);
  }

  public clearCloseTimeout(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  public close(): void {
    if (this._closed) {
      throw new Error(`Session (id#${this.id}) already closed`);
    }
    this.clearCloseTimeout();
    this._closed = true;
    this.emitter.emit("close", this);
    this._internalClose();
    console.log(`Session (id#${this.id}) is closed`);
  }

  public async forceClose(): Promise<void> {
    if (this._forceClosed) {
      throw new Error(`Session (id#${this.id}) already force closed`);
    }
    this.clearCloseTimeout();
    this._forceClosed = true;
    this.emitter.emit("forceClose", this);
    this._taskManager.getAll().forEach((task) => {
      if (task.options.session === this && !endStatuses.includes(task.status)) {
        task.interrupt();
      }
    });
    this._taskManager.clear();
    await this._options.connection.disconnect();
    console.log(`Session (id#${this.id}) is force closed`);
  }

  private _internalClose(): void {
    if (this._closed) {
      const runningTasks = this._taskManager
        .find(TaskStatus.RUNNING)
        .filter((task) => task.options.session === this);
      if (runningTasks.length) {
        this._taskManager.emitter.once("change", () => this._internalClose());
      } else {
        this.forceClose().catch(console.error);
      }
    }
  }
}
