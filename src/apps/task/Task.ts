import {v1 as uuidV1} from "uuid";
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

export interface IChangeListener<Action, Payload, Result> {
  onChangeTask(task: Task<Action, Payload, Result>): void;
}

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

export class Task<Action, Payload, Result> {

  public static readonly DEFAULT_PAUSE_CHECK_TIMEOUT = 5 * 1000;

  private readonly _id: string;
  private readonly _options: IOptions<Action, Payload, Result>;
  private readonly _changeListeners: Array<IChangeListener<Action, Payload, Result>> = [];
  private readonly _progress: Progress;
  private readonly _log: any[] = [];

  private _status: TaskStatus = TaskStatus.IDLE;
  private _result?: Result;
  private _error?: Error;

  constructor(options: IOptions<Action, Payload, Result>) {
    this._id = uuidV1().toUpperCase();
    this._options = options;
    this._progress = new Progress(options.progress, () => {
      this._updateStatus(this._status);
    });
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

  get log(): any[] {
    return this._log;
  }

  get result(): Result | undefined {
    return this._result;
  }

  get error(): Error | undefined {
    return this._error;
  }

  public addChangeListener(changeListener: IChangeListener<Action, Payload, Result>): void {
    this._changeListeners.push(changeListener);
  }

  public removeChangeListener(changeListener: IChangeListener<Action, Payload, Result>): void {
    this._changeListeners.splice(this._changeListeners.indexOf(changeListener), 1);
  }

  public clearChangeListeners(): void {
    this._changeListeners.splice(0, this._changeListeners.length);
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
      this._error = error;
      this._updateStatus(TaskStatus.ERROR);
    }
  }

  private _updateStatus(status: TaskStatus): void {
    if (endStatuses.includes(this._status)) {
      throw new Error("Task was finished");
    }
    this._status = status;
    this._log.push(`Status: ${TaskStatus[status]}; Progress: ${this._progress.value};`);
    this._changeListeners.forEach((listener) => listener.onChangeTask(this));
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
