import {EventEmitter} from "events";
import StrictEventEmitter from "strict-event-emitter-types";
import {v1 as uuidV1} from "uuid";
import {ErrorCode, ServerError} from "../../stomp/ServerError";
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

export const endStatuses = [TaskStatus.INTERRUPTED, TaskStatus.ERROR, TaskStatus.DONE];

export type StatusChecker = () => Promise<void | never>;

export interface IContext {
  session: Session;
  checkStatus: StatusChecker;
  progress: Progress;
}

export type TaskWorker<Result> = (context: IContext) => Result | Promise<Result>;

export interface ICommand<A, P = any> {
  readonly action: A;
  readonly payload: P;
}

export interface IOptions<Action, Payload, Result> {
  readonly command: ICommand<Action, Payload>;
  readonly session: Session;
  readonly destination: string;
  readonly progress?: IProgressOptions;
  readonly pauseCheckTimeout?: number;
  readonly worker: TaskWorker<Result>;
}

export interface ITaskLog {
  date: Date;
  status: TaskStatus;
}

export interface IEvents<Action, Payload, Result> {
  change: (task: Task<Action, Payload, Result>) => void;
  progress: (task: Task<Action, Payload, Result>) => void;
}

export class Task<Action, Payload, Result> {

  public static readonly DEFAULT_PAUSE_CHECK_TIMEOUT = 5 * 1000;

  public readonly emitter: StrictEventEmitter<EventEmitter, IEvents<Action, Payload, Result>> = new EventEmitter();

  private readonly _id: string;
  private readonly _options: IOptions<Action, Payload, Result>;
  private readonly _progress: Progress;
  private readonly _log: ITaskLog[] = [];

  private _status: TaskStatus = TaskStatus.IDLE;
  private _result?: Result;
  private _error?: ServerError;

  constructor(options: IOptions<Action, Payload, Result>) {
    this._id = uuidV1().toUpperCase();
    this._options = options;
    this._progress = new Progress(options.progress, () => this.emitter.emit("progress", this));
    this._updateStatus(TaskStatus.IDLE);
  }

  get id(): string {
    return this._id;
  }

  get options(): IOptions<Action, Payload, Result> {
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
      throw new Error(`Task mast has ${TaskStatus[TaskStatus.IDLE]} status, but he has ${TaskStatus[this._status]}`);
    }
    this._updateStatus(TaskStatus.RUNNING);
    try {
      await this._checkStatus();
      this._result = await this._options.worker({
        session: this._options.session,
        checkStatus: this._checkStatus.bind(this),
        progress: this._progress
      });
      this._updateStatus(TaskStatus.DONE);
    } catch (error) {
      this._error = error instanceof ServerError ? error : new ServerError(ErrorCode.INTERNAL, error.message);
      this._updateStatus(TaskStatus.ERROR);
    }
  }

  private _updateStatus(status: TaskStatus): void {
    if (endStatuses.includes(this._status)) {
      throw new Error("Task was finished");
    }
    this._status = status;
    this._log.push({
      date: new Date(),
      status: this._status
    });
    this.emitter.emit("change", this);
  }

  private async _checkStatus(): Promise<void | never> {
    switch (this._status) {
      case TaskStatus.PAUSED:
        await new Promise((resolve) => {
          setTimeout(resolve, this._options.pauseCheckTimeout || Task.DEFAULT_PAUSE_CHECK_TIMEOUT);
        });
        await this._checkStatus();
        break;
      case TaskStatus.INTERRUPTED:
        throw new Error("Task was interrupted");
      case TaskStatus.DONE:
        throw new Error("Task was finished");
      case TaskStatus.IDLE:
        throw new Error("Task wasn't started");
      case TaskStatus.RUNNING:
      default:
        break;
    }
  }
}
