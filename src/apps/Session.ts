import {AConnection} from "gdmn-db";
import {TaskManager} from "./task/TaskManager";

export type CloseListener = (session: Session) => void;

export interface IOptions {
  readonly id: string;
  readonly userKey: number;
  readonly timeout?: number;
  readonly connection: AConnection;
}

export class Session {

  private static DEFAULT_TIMEOUT = 5 * 60 * 1000;

  private readonly _options: IOptions;
  private readonly _closeListener: CloseListener;
  private readonly _taskManager = new TaskManager();

  private _holdings = 0;
  private _timer?: NodeJS.Timer;

  constructor(options: IOptions, closeListener: CloseListener) {
    this._options = options;
    this._closeListener = closeListener;
    this.updateTimer();
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

  get taskManager(): TaskManager {
    return this._taskManager;
  }

  public borrow(): void {
    this._holdings++;
    this.clearTimer();
  }

  public release(): void {
    if (this._holdings === 0) {
      throw new Error("Session is not using");
    }
    this._holdings--;
    if (this._holdings === 0) {
      this.updateTimer();
    }
  }

  public async close(): Promise<void> {
    this.clearTimer();
    this._closeListener(this);
    this._taskManager.clear();
    await this._options.connection.disconnect();
  }

  private updateTimer(): void {
    this.clearTimer();
    this._timer = setTimeout(() => {
      if (this._taskManager.length()) {
        this.updateTimer();
      } else {
        this.close().catch(console.error);
        this.clearTimer();
      }
    }, Session.DEFAULT_TIMEOUT);
  }

  private clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
    }
  }
}
