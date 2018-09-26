import {IEntityQueryInspector} from "gdmn-orm";
import {StompClientCommandListener, StompError, StompHeaders, StompServerSessionLayer} from "node-stomp-protocol";
import {Application} from "../apps/Application";
import {Session} from "../apps/Session";
import {ICommand, Task, TaskStatus} from "../apps/task/Task";
import {IChangeStatusListener} from "../apps/task/TaskManager";
import {getPayloadFromJwtToken} from "../passport";

type Action = "PING" | "GET_SCHEMA" | "QUERY";

type Command<A extends Action, P> = ICommand<A, P>;

type PingCommand = Command<"PING", { delay: number }>;
type GetSchemaCommand = Command<"GET_SCHEMA", undefined>;
type QueryCommand = Command<"QUERY", IEntityQueryInspector>;

export type Ack = "auto" | "client" | "client-individual";

export interface ISubscription {
  id: string;
  destination: string;
  ack: Ack;
}

export class StompSession implements StompClientCommandListener, IChangeStatusListener<any, any, any> {

  public static readonly DESTINATION_TASK = "/task";

  private readonly _stomp: StompServerSessionLayer;
  private readonly _subscriptions: ISubscription[] = [];

  private _session?: Session;
  private _application?: Application;

  constructor(session: StompServerSessionLayer) {
    this._stomp = session;
  }

  get application(): Application {
    if (!this._application) {
      throw new Error("Application is not found");
    }
    return this._application;
  }

  set application(value: Application) {
    this._application = value;
  }

  get session(): Session {
    if (!this._session) {
      throw new Error("Unauthorized");
    }
    return this._session;
  }

  get stomp(): StompServerSessionLayer {
    return this._stomp;
  }

  get subscriptions(): ISubscription[] {
    return this._subscriptions;
  }

  protected static _getUserKey(headers?: StompHeaders): number {
    if (!headers || !headers!.access_token) {
      throw new Error("access_token is not found");
    }
    return getPayloadFromJwtToken(headers.access_token).id;
  }

  public onChange(task: Task<any, any, any>): void {
    switch (task.status) {
      case TaskStatus.DONE:
      case TaskStatus.ERROR:
      case TaskStatus.INTERRUPTED:
        if (this._subscriptions.find((sub) => sub.destination === task.destination)) {
          this._sendTaskMessage(task).catch(console.error);
        }
        break;
    }
  }

  public onProtocolError(error: StompError): void {
    console.log("protocol error", error);
  }

  public connect(headers?: StompHeaders): void {
    this._internalConnect(headers)
      .catch((error) => {
        this._sendError(error).catch(console.error);
      });
  }

  public disconnect(): void {
    // empty
  }

  public onEnd(): void {
    if (this._session) {
      this._session.taskManager.removeChangeStatusListener(this);
      this._session.release();
    }
  }

  public subscribe(headers?: StompHeaders): void {
    switch (headers!.destination) {
      case StompSession.DESTINATION_TASK:
        if (this._subscriptions.some((sub) => sub.id === headers!.id)) {
          throw new Error("Subscriptions with same id exists");
        }
        if (this._subscriptions.some((sub) => sub.destination === headers!.destination)) {
          throw new Error("Subscriptions with same destination exists");
        }
        this._subscriptions.push({
          id: headers!.id,
          destination: headers!.destination,
          ack: headers!.ack as Ack || "auto"
        });

        // notify about tasks
        const tasks = this.session.taskManager.getAll();
        tasks.forEach((task) => this._sendTaskMessage(task).catch(console.error));
        break;
      default:
        throw new Error(`Unsupported destination '${headers!.destination}'`);
    }
  }

  public unsubscribe(headers?: StompHeaders): void {
    const subscriptionIndex = this._subscriptions.findIndex((sub) => sub.id === headers!.id);
    if (subscriptionIndex === -1) {
      throw new Error("Subscription is not found");
    }
    this._subscriptions.splice(subscriptionIndex, 1);
  }

  public send(headers?: StompHeaders, body?: string): void {
    const destination = headers!.destination;

    switch (destination) {
      case StompSession.DESTINATION_TASK:
        this._checkContentType(headers);

        const action = headers!.action as Action;
        const bodyObj = JSON.parse(body!);

        switch (action) {
          case "PING": {
            const command: PingCommand = {action, ...bodyObj};
            const {delay} = command.payload || {delay: 0};

            this.session.taskManager.add({
              command,
              destination,
              worker: async (checkStatus) => {
                await new Promise((resolve) => setTimeout(resolve, delay));
                await checkStatus();
                if (!this.application.connected) {
                  throw new Error("Application is not connected");
                }
              }
            });
            break;
          }
          case "GET_SCHEMA": {
            const command: GetSchemaCommand = {action, payload: undefined};

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => this.application.erModel.serialize()
            });
            break;
          }
          case "QUERY": {
            const command: QueryCommand = {action, ...bodyObj};

            this.session.taskManager.add({
              command,
              destination,
              worker: async (checkStatus) => {
                const result = this.application.query(command.payload, this.session);
                await checkStatus();
                return result;
              }
            });
            break;
          }
          default:
            throw new Error("Unsupported action");
        }
        break;
      default:
        throw new Error(`Unsupported destination '${destination}'`);
    }
  }

  public ack(headers?: StompHeaders): void {
    const task = this.session.taskManager.find(headers!.id);
    if (task) {
      this.session.taskManager.delete(task);
    }
  }

  public nack(): void {
    throw new Error("Unsupported yet");
  }

  public begin(): void {
    throw new Error("Unsupported yet");
  }

  public commit(): void {
    throw new Error("Unsupported yet");
  }

  public abort(): void {
    throw new Error("Unsupported yet");
  }

  protected async _internalConnect(headers?: StompHeaders): Promise<void> {
    const pack = require("../../package.json");
    const userKey = StompSession._getUserKey(headers);
    this._session = await this._application!.sessionManager.get(userKey);
    if (!this._session) {
      this._session = await this._application!.sessionManager.open(userKey);
    }
    this._session.borrow();
    this._session.taskManager.addChangeStatusListener(this);
    const resHeaders: StompHeaders = {server: `${pack.name}/${pack.version}`, session: this._session.id};
    await this._stomp.connected(resHeaders);
  }

  protected async _sendTaskMessage(task: Task<any, any, any>): Promise<void> {
    const subscription = this._subscriptions.find((sub) => sub.destination === task.destination);
    if (subscription) {
      const headers: StompHeaders = {
        "content-type": "application/json;charset=utf-8",
        "destination": task.destination,
        "action": task.command.action,
        "subscription": subscription.id,
        "message-id": task.id,
        "ack": task.id
      };
      const body = JSON.stringify({
        status: task.status,
        payload: task.command.payload,
        result: task.result ? task.result : undefined,
        errorMessage: task.error ? task.error.message : undefined
      });
      await this._stomp.message(headers, body);
    }
  }

  protected async _sendError(error: Error, headers?: StompHeaders): Promise<void> {
    const errorHeaders: StompHeaders = {message: error.message};
    if (headers && headers.receipt) {
      errorHeaders["receipt-id"] = headers.receipt;
    }
    await this._stomp.error(errorHeaders);
  }

  protected _checkContentType(headers?: StompHeaders): void | never {
    const contentType = headers!["content-type"];
    if (contentType !== "application/json;charset=utf-8") {
      throw new Error(`Unsupported content-type '${contentType}'; supported - 'application/json;charset=utf-8'`);
    }
  }
}
