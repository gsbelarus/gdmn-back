import {v1 as uuidV1} from "uuid";
import {ChangeStatusListener, IOptions, Task, TaskStatus} from "./Task";

export interface IChangeStatusListener<Action, Payload, Result> {
  onChange: ChangeStatusListener<Action, Payload, Result>;
}

export class TaskManager {

  private readonly _list: Array<Task<any, any, any>> = [];
  private readonly _changeStatusListeners: Array<IChangeStatusListener<any, any, any>> = [];

  public addChangeStatusListener<Result>(changeStatusListener: IChangeStatusListener<any, any, Result>): void {
    this._changeStatusListeners.push(changeStatusListener);
  }

  public removeChangeStatusListener<Result>(changeStatusListener: IChangeStatusListener<any, any, Result>): void {
    this._changeStatusListeners.splice(this._changeStatusListeners.indexOf(changeStatusListener), 1);
  }

  public clearChangeStatusListeners(): void {
    this._changeStatusListeners.splice(0, this._changeStatusListeners.length);
  }

  public add<Action, Payload, Result>(
    options: IOptions<Action, Payload, Result>
  ): Task<Action, Payload, Result> {
    const uid = uuidV1().toUpperCase();
    const task = new Task(uid, options, (t) => {
      this._changeStatusListeners.forEach((listener) => listener.onChange(t));
    });
    this._list.push(task);
    task.execute().catch(console.error);
    return task;
  }

  public find<Action, Payload, Result>(uid: string): Task<Action, Payload, Result> | undefined;
  public find<Action, Payload, Result>(...status: TaskStatus[]): Array<Task<Action, Payload, Result>>;
  public find(...source: any[]): any {
    if (typeof source[0] === "string") {
      return this._list.find((task) => task.id === source[0]);
    } else {
      return this._list.filter((task) => source.includes(task.status));
    }
  }

  public getAll(): Array<Task<any, any, any>> {
    return this._list.slice();
  }

  public delete(task: Task<any, any, any>): void {
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
