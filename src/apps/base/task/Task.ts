import {EventEmitter} from "events";
import {Logger} from "log4js";
import StrictEventEmitter from "strict-event-emitter-types";
import {v1 as uuidV1} from "uuid";
import {ErrorCode, ServerError} from "../../../stomp/ServerError";
import {Session} from "../Session";
import {IProgressOptions, Progress} from "./Progress";

export enum TaskStatus {
  IDLE,
  RUNNING,
  PAUSED,

  INTERRUPTED,
  ERROR,
  DONE
}

export enum Level {
  SESSION, USER, APPLICATION
}

export type StatusChecker = () => Promise<void | never>;

export interface IContext<Command extends ICommand<any>> {
  command: Command;
  session: Session;
  checkStatus: StatusChecker;
  progress: Progress;
}

export type TaskWorker<Command extends ICommand<any>, Result>
  = (context: IContext<Command>) => Result | Promise<Result>;

export interface ICommand<A, P = any> {
  readonly action: A;
  readonly payload: P;
}

export interface IOptions<Command extends ICommand<any>, Result> {
  readonly command: Command;
  readonly session: Session;
  readonly level: Level;
  readonly logger?: Logger;
  readonly progress?: IProgressOptions;
  readonly pauseCheckTimeout?: number;
  readonly worker: TaskWorker<Command, Result>;
}

export interface ITaskLog {
  date: Date;
  status: TaskStatus;
}

export interface ITaskEvents<Command extends ICommand<any>, Result> {
  change: (task: Task<Command, Result>) => void;
  progress: (task: Task<Command, Result>) => void;
}

export class Task<Command extends ICommand<any>, Result> {

  public static readonly DEFAULT_PAUSE_CHECK_TIMEOUT = 5 * 1000;

  public readonly emitter: StrictEventEmitter<EventEmitter, ITaskEvents<Command, Result>> = new EventEmitter();

  protected readonly _logger: Logger | Console;

  private readonly _id: string;
  private readonly _options: IOptions<Command, Result>;
  private readonly _progress: Progress;
  private readonly _log: ITaskLog[] = [];

  private _status: TaskStatus = TaskStatus.IDLE;
  private _result?: Result;
  private _error?: ServerError;

  constructor(options: IOptions<Command, Result>) {
    this._id = uuidV1().toUpperCase();
    this._options = options;
    this._logger = options.logger || console;
    this._progress = new Progress(options.progress);
    this._progress.emitter.on("change", () => {
      this._logger.info("id#%s in progress; Value: %s; Description: %s", this._id, this._progress.value,
        this._progress.description);
      this.emitter.emit("progress", this);
    });
    this._updateStatus(TaskStatus.IDLE);
  }

  get id(): string {
    return this._id;
  }

  get options(): IOptions<Command, Result> {
    return this._options;
  }

  get progress(): Progress {
    return this._progress;
  }

  get status(): TaskStatus {
    return this._status;
  }

  get log(): ITaskLog[] {
    return this._log;
  }

  get result(): Result | undefined {
    return this._result;
  }

  get error(): ServerError | undefined {
    return this._error;
  }

  public interrupt(): void {
    this._updateStatus(TaskStatus.INTERRUPTED);
  }

  public pause(): void {
    this._updateStatus(TaskStatus.PAUSED);
  }

  public resume(): void {
    this._updateStatus(TaskStatus.RUNNING);
  }

  public getDate(status: TaskStatus): Date | undefined {
    const event = this._log.find((e) => e.status === status);
    if (event) {
      return event.date;
    }
  }

  public async execute(): Promise<void> {
    if (this._status !== TaskStatus.IDLE) {
      this._logger.error("id#%s mast has %s status, but he has %s", this._id, TaskStatus[TaskStatus.IDLE],
        TaskStatus[this._status]);
      throw new Error(`Task mast has ${TaskStatus[TaskStatus.IDLE]} status, but he has ${TaskStatus[this._status]}`);
    }
    this._updateStatus(TaskStatus.RUNNING);
    try {
      await this._checkStatus();
      this._result = await this._options.worker({
        command: this.options.command,
        session: this._options.session,
        checkStatus: this._checkStatus.bind(this),
        progress: this._progress
      });
      this._updateStatus(TaskStatus.DONE);
    } catch (error) {
      this._logger.warn("id#%s throw error; Error: %s", error);
      this._error = error instanceof ServerError ? error : new ServerError(ErrorCode.INTERNAL, error.message);
      this._updateStatus(TaskStatus.ERROR);
    }
  }

  private _updateStatus(status: TaskStatus): void {
    if ([TaskStatus.INTERRUPTED, TaskStatus.ERROR, TaskStatus.DONE].includes(this._status)) {
      this._logger.error("id#%s was finished", this._id);
      throw new Error("Task was finished");
    }
    this._status = status;
    this._log.push({
      date: new Date(),
      status: this._status
    });
    this._logger.info("id#%s is changed; Action: %s; Status: %s", this._id, this._options.command.action,
      TaskStatus[this._status]);
    this.emitter.emit("change", this);
  }

  private async _checkStatus(): Promise<void | never> {
    switch (this._status) {
      case TaskStatus.PAUSED:
        await new Promise((resolve) => {
          const timeout = this._options.pauseCheckTimeout || Task.DEFAULT_PAUSE_CHECK_TIMEOUT;
          this._logger.info("id#%s is paused, check after %s minutes", timeout / (60 * 1000));
          setTimeout(resolve, timeout);
        });
        await this._checkStatus();
        break;
      case TaskStatus.INTERRUPTED:
        this._logger.error("Was interrupted");
        throw new Error("Task was interrupted");
      case TaskStatus.DONE:
        this._logger.error("Was finished");
        throw new Error("Task was finished");
      case TaskStatus.IDLE:
        this._logger.error("Wasn't started");
        throw new Error("Task wasn't started");
      case TaskStatus.RUNNING:
      default:
        break;
    }
  }
}
