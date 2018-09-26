import {StompClientCommandListener, StompError, StompHeaders, StompServerSessionLayer} from "node-stomp-protocol";
import {Application} from "../apps/Application";
import {Session} from "../apps/Session";
import {Task, TaskStatus} from "../apps/task/Task";
import {IChangeStatusListener} from "../apps/task/TaskManager";
import {getPayloadFromJwtToken} from "../passport";

export interface ICommand<A, P> {
  readonly action: A;
  readonly payload: P;
}

type Action = "PING";

type Command<A extends Action, P> = ICommand<A, P>;

type PingCommand = Command<"PING", { delay: number }>;

export type Ack = "auto" | "client" | "client-individual";

export interface ISubscription {
  id: string;
  destination: string;
  ack: Ack;
}

export class StompSession implements StompClientCommandListener, IChangeStatusListener<any> {

  public static readonly TOPIC_TASK = "/task";

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

  public onChange(task: Task<any>): void {
    switch (task.status) {
      case TaskStatus.DONE:
      case TaskStatus.ERROR:
      case TaskStatus.INTERRUPTED:
        if (this._subscriptions.find((sub) => sub.destination === task.destination)) {
          this._internalMessage(task).catch(console.error);
        }
        break;
    }
  }

  public onProtocolError(error: StompError): void {
    console.log("Protocol error!", error);
  }

  public connect(headers?: StompHeaders): void {
    console.log("Connect!", headers);
    this._internalConnect(headers)
      .catch((error) => {
        this.sendError(error).catch(console.error);
      });
  }

  public disconnect(headers?: StompHeaders): void {
    console.log("Disconnect!", headers);
  }

  public onEnd(): void {
    console.log("End!");
    if (this._session) {
      this._session.taskManager.removeChangeStatusListener(this);
      this._session.release();
    }
  }

  public subscribe(headers?: StompHeaders): void {
    console.log("subscription done", headers);
    this._checkDestination(headers!.destination, StompSession.TOPIC_TASK);
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
  }

  public unsubscribe(headers?: StompHeaders): void {
    console.log("unsubscribe", headers);
    const subscriptionIndex = this._subscriptions.findIndex((sub) => sub.id === headers!.id);
    if (subscriptionIndex === -1) {
      throw new Error("Subscription is not found");
    }
    this._subscriptions.splice(subscriptionIndex, 1);
  }

  public send(headers?: StompHeaders, body?: string): void {
    console.log("Send!", body, headers);
    const action = headers!.action as Action;
    switch (action) {
      case "PING": {
        this._checkDestination(headers!.destination, StompSession.TOPIC_TASK);
        const command: PingCommand = {action, payload: JSON.parse(body!)};
        const {delay} = command.payload;

        this.session.taskManager.add({
          action: command.action,
          destination: headers!.destination,
          worker: async () => {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        });
        break;
      }
      default:
        throw new Error("Unsupported action");
    }
  }

  public ack(headers?: StompHeaders): void {
    console.log("ack", headers);
    throw new Error("Unsupported yet");
  }

  public nack(headers?: StompHeaders): void {
    console.log("nack", headers);
    throw new Error("Unsupported yet");
  }

  public begin(headers?: StompHeaders): void {
    console.log("begin", headers);
    throw new Error("Unsupported yet");
  }

  public commit(headers?: StompHeaders): void {
    console.log("commit", headers);
    throw new Error("Unsupported yet");
  }

  public abort(headers?: StompHeaders): void {
    console.log("abort", headers);
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
    await this._stomp.connected({server: `${pack.name}/${pack.version}`, session: this._session.id});
  }

  protected async _internalMessage(task: Task<any>): Promise<void> {
    const subscription = this._subscriptions.find((sub) => sub.destination === task.destination);
    if (subscription) {
      try {
        task.sending = true;
        await this._stomp.message({
          "destination": task.destination,
          "action": task.action,
          "subscription": subscription.id,
          "message-id": task.id
        }, JSON.stringify({
          status: task.status,
          result: task.result ? task.result : undefined,
          errorMessage: task.error ? task.error.message : undefined
        }));
        console.log(task.log);
        this.session.taskManager.delete(task); // TODO move to ack handler

      } catch (error) {
        console.error(error);
        task.sending = false;
      }
    }
  }

  protected _checkDestination(destination: string, ...destinations: string[]): void | never {
    if (!destinations.some((d) => d === destination)) {
      throw new Error(`Unsupported destination '${destination}',`
        + ` supported  ${destinations.map((d) => `'${d}'`).join(", ")};`);
    }
  }

  protected async sendError(error: Error, headers?: StompHeaders): Promise<void> {
    const errorHeaders: StompHeaders = {message: error.message};
    if (headers && headers.receipt) {
      errorHeaders["receipt-id"] = headers.receipt;
    }
    await this._stomp.error(errorHeaders);
  }
}
