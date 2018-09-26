import {v1 as uuidV1} from "uuid";
import {ChangeStatusListener, IOptions, Task} from "./Task";

export interface IChangeStatusListener<Result> {
  onChange: ChangeStatusListener<Result>;
}

export class TaskManager {

  private readonly _list: Array<Task<any>> = [];
  private readonly _changeStatusListeners: Array<IChangeStatusListener<any>> = [];

  public addChangeStatusListener<Result>(changeStatusListener: IChangeStatusListener<Result>): void {
    this._changeStatusListeners.push(changeStatusListener);
  }

  public removeChangeStatusListener<Result>(changeStatusListener: IChangeStatusListener<Result>): void {
    this._changeStatusListeners.splice(this._changeStatusListeners.indexOf(changeStatusListener), 1);
  }

  public clearChangeStatusListeners(): void {
    this._changeStatusListeners.splice(0, this._changeStatusListeners.length);
  }

  public add<Result>(options: IOptions<any>): Task<Result> {
    const uid = uuidV1().toUpperCase();
    const task = new Task(uid, options, (t) => {
      this._changeStatusListeners.forEach((listener) => listener.onChange(t));
    });
    this._list.push(task);
    task.execute().catch(console.error);
    return task;
  }

  public find<Result>(uid: string): Task<Result> | undefined {
    return this._list.find((task) => task.id === uid);
  }

  public delete(task: Task<any>): void {
    const index = this._list.indexOf(task);
    if (index === -1) {
      throw new Error("Task not found");
    }
    this._list.splice(this._list.indexOf(task), 1);
  }

  public clear(): void {
    this._list.forEach((task) => task.interrupt());
    this._list.splice(0, this._list.length);
  }
}
