import {EventEmitter} from "events";
import StrictEventEmitter from "strict-event-emitter-types";
import {ICommand, IEvents, Task, TaskStatus} from "./Task";

export class TaskManager {

  public readonly emitter: StrictEventEmitter<EventEmitter, IEvents<any, any>> = new EventEmitter();

  private readonly _tasks = new Set<Task<any, any>>();

  private readonly _onChangeTask: IEvents<any, any>["change"];
  private readonly _onProgressTask: IEvents<any, any>["progress"];

  constructor() {
    this._onChangeTask = (task: Task<any, any>) => this.emitter.emit("change", task);
    this._onProgressTask = (task: Task<any, any>) => this.emitter.emit("progress", task);
  }

  public add<Command extends ICommand<any>, Result>(task: Task<Command, Result>): Task<Command, Result> {
    this._tasks.add(task);
    task.emitter.addListener("change", this._onChangeTask);
    task.emitter.addListener("progress", this._onProgressTask);
    return task;
  }

  public remove(task: Task<any, any>): void {
    if (!this._tasks.has(task)) {
      throw new Error("Task not found");
    }
    task.emitter.removeListener("progress", this._onProgressTask);
    task.emitter.removeListener("change", this._onChangeTask);
    this._tasks.delete(task);
  }

  public find<Command extends ICommand<any>, Result>(uid: string): Task<Command, Result> | undefined;
  public find<Command extends ICommand<any>, Result>(...status: TaskStatus[]): Array<Task<Command, Result>>;
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

  public getAll(): Set<Task<any, any>> {
    return this._tasks;
  }

  public clear(): void {
    this._tasks.clear();
  }
}
