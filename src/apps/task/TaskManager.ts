import {IChangeListener, Task, TaskStatus} from "./Task";

export class TaskManager implements IChangeListener<any, any, any> {

  private readonly _tasks = new Set<Task<any, any, any>>();
  private readonly _changeListeners: Array<IChangeListener<any, any, any>> = [];

  public onChangeTask(task: Task<any, any, any>): void {
    this._changeListeners.forEach((listener) => listener.onChangeTask(task));
  }

  public add<Action, Payload, Result>(task: Task<Action, Payload, Result>): Task<Action, Payload, Result> {
    this._tasks.add(task);
    task.addChangeListener(this);
    return task;
  }

  public remove(task: Task<any, any, any>): void {
    if (!this._tasks.has(task)) {
      throw new Error("Task not found");
    }
    task.removeChangeListener(this);
    this._tasks.delete(task);
  }

  public find<Action, Payload, Result>(uid: string): Task<Action, Payload, Result> | undefined;
  public find<Action, Payload, Result>(...status: TaskStatus[]): Array<Task<Action, Payload, Result>>;
  public find(...source: any[]): any {
    if (typeof source[0] === "string") {
      for (const task of this._tasks) {
        if (task.id === source[0]) {
          return task;
        }
      }
      return undefined;
    } else {
      const filter = [];
      for (const task of this._tasks) {
        if (source.includes(task.status)) {
          filter.push(task);
        }
      }
      return filter;
    }
  }

  public size(): number {
    return this._tasks.size;
  }

  public getAll(): Set<Task<any, any, any>> {
    return this._tasks;
  }

  public clear(): void {
    this._tasks.clear();
  }

  public addChangeTaskListener(changeListener: IChangeListener<any, any, any>): void {
    this._changeListeners.push(changeListener);
  }

  public removeChangeTaskListener(changeListener: IChangeListener<any, any, any>): void {
    this._changeListeners.splice(this._changeListeners.indexOf(changeListener), 1);
  }

  public clearChangeTaskListeners(): void {
    this._changeListeners.splice(0, this._changeListeners.length);
  }
}
