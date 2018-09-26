export enum TaskStatus {
  IDLE,
  RUNNING,
  PAUSED,

  INTERRUPTED,
  ERROR,
  DONE
}

export type ChangeStatusListener<Result> = (task: Task<Result>) => void;

export type StatusChecker = () => Promise<void | never>;

export type TaskWorker<Result> = (checkStatus: StatusChecker) => Promise<Result>;

export interface IOptions<Result> {
  readonly action: string;
  readonly destination: string;
  readonly worker: TaskWorker<Result>;
}

export class Task<Result> {

  private readonly _id: string;
  private readonly _options: IOptions<Result>;
  private readonly _changeStatusListener?: ChangeStatusListener<Result>;
  private readonly _log: any[] = [];
  private _status: TaskStatus = TaskStatus.IDLE;
  private _result?: Result;
  private _error?: Error;

  private _sending: boolean = false;

  constructor(id: string, options: IOptions<Result>, changeStatusListener?: ChangeStatusListener<Result>) {
    this._id = id;
    this._options = options;
    this._changeStatusListener = changeStatusListener;
    this._notifyListener();
  }

  get id(): string {
    return this._id;
  }

  get action(): string {
    return this._options.action;
  }

  get destination(): string {
    return this._options.destination;
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

  get sending(): boolean {
    return this._sending;
  }

  set sending(value: boolean) {
    this._sending = value;
  }

  public interrupt(): void {
    this.updateStatus(TaskStatus.INTERRUPTED);
  }

  public pause(): void {
    this.updateStatus(TaskStatus.PAUSED);
  }

  public resume(): void {
    this.updateStatus(TaskStatus.RUNNING);
  }

  public async execute(): Promise<void> {
    if (this._status !== TaskStatus.IDLE) {
      throw new Error(`Task mast has NOT_RUNNING status, but he has ${TaskStatus[this._status]}`);
    }
    this.updateStatus(TaskStatus.RUNNING);
    try {
      await this._checkStatus();
      this._result = await this._options.worker(this._checkStatus.bind(this));
      this.updateStatus(TaskStatus.DONE);
    } catch (error) {
      this._error = error;
      this.updateStatus(TaskStatus.ERROR);
    }
  }

  private updateStatus(status: TaskStatus): void {
    if (this._status === TaskStatus.DONE
      || this._status === TaskStatus.ERROR
      || this._status === TaskStatus.INTERRUPTED) {
      throw new Error("Task was finished");
    }
    this._status = status;
    this._log.push(TaskStatus[status]);
    this._notifyListener();
  }

  private _notifyListener(): void {
    if (this._changeStatusListener) {
      this._changeStatusListener(this);
    }
  }

  private async _checkStatus(): Promise<void | never> {
    switch (this._status) {
      case TaskStatus.PAUSED:
        await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
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
