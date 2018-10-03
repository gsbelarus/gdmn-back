import {IEntityQueryInspector} from "gdmn-orm";
import {StompClientCommandListener, StompError, StompHeaders, StompServerSessionLayer} from "node-stomp-protocol";
import {Application} from "../apps/Application";
import {MainApplication} from "../apps/MainApplication";
import {Session} from "../apps/Session";
import {endStatuses, ICommand, Task, TaskStatus} from "../apps/task/Task";
import {IChangeStatusListener} from "../apps/task/TaskManager";
import {ITokens, Utils} from "./Utils";

type Action = "DELETE_APP" | "CREATE_APP" | "GET_APPS" |
  "PING" | "GET_SCHEMA" | "QUERY";

type Command<A extends Action, P> = ICommand<A, P>;

type DeleteAppCommand = Command<"DELETE_APP", { uid: string }>;
type CreateAppCommand = Command<"CREATE_APP", { alias: string }>;
type GetAppsCommand = Command<"GET_APPS", undefined>;

type PingCommand = Command<"PING", { steps: number, delay: number }>;
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

  public static readonly IGNORED_ACK_ID = "ignored-id";

  private readonly _stomp: StompServerSessionLayer;
  private readonly _subscriptions: ISubscription[] = [];

  private _session?: Session;
  private _application?: Application;
  private _mainApplication?: MainApplication;

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

  get mainApplication(): MainApplication {
    if (!this._mainApplication) {
      throw new Error("MainApplication is not found");
    }
    return this._mainApplication;
  }

  set mainApplication(value: MainApplication) {
    this._mainApplication = value;
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

  public onChange(task: Task<any, any, any>): void {
    if (this._subscriptions.find((sub) => sub.destination === task.options.destination)) {
      this._sendTaskMessage(task).catch(console.warn);
    }
  }

  public onProtocolError(error: StompError): void {
    console.log("Protocol Error", error);
  }

  public connect(headers: StompHeaders = {}): void {
    this._internalConnect(headers)
      .catch((error) => {
        this._sendError(error, headers).catch(console.warn);
      });
  }

  public disconnect(headers: StompHeaders = {}): void {
    this.onEnd();

    this._sendReceipt(headers).catch(console.warn);
  }

  public onEnd(): void {
    if (this._session) {
      this._subscriptions.splice(0, this._subscriptions.length);
      this._session.taskManager.removeChangeStatusListener(this);
      this._session.release();
      this._session = undefined;
    }
  }

  public subscribe(headers: StompHeaders = {}): void {
    switch (headers.destination) {
      case StompSession.DESTINATION_TASK:
        if (this._subscriptions.some((sub) => sub.id === headers.id)) {
          throw new Error("Subscriptions with same id exists");
        }
        if (this._subscriptions.some((sub) => sub.destination === headers.destination)) {
          throw new Error("Subscriptions with same destination exists");
        }
        this._subscriptions.push({
          id: headers.id,
          destination: headers.destination,
          ack: headers.ack as Ack || "auto"
        });

        this._sendReceipt(headers).catch(console.warn);

        // notify about tasks
        const tasks = this.session.taskManager.getAll();
        tasks.forEach((task) => this._sendTaskMessage(task).catch(console.warn));
        break;
      default:
        throw new Error(`Unsupported destination '${headers.destination}'`);
    }
  }

  public unsubscribe(headers: StompHeaders = {}): void {
    const subscriptionIndex = this._subscriptions.findIndex((sub) => sub.id === headers.id);
    if (subscriptionIndex === -1) {
      throw new Error("Subscription is not found");
    }
    this._subscriptions.splice(subscriptionIndex, 1);

    this._sendReceipt(headers).catch(console.warn);
  }

  public send(headers: StompHeaders = {}, body: string = ""): void {
    const destination = headers.destination;

    switch (destination) {
      case StompSession.DESTINATION_TASK:
        Utils.checkContentType(headers);

        const action = headers.action as Action;
        const bodyObj = JSON.parse(body!);

        switch (action) {
          // ------------------------------For MainApplication
          case "DELETE_APP": {  // TODO tmp
            const command: DeleteAppCommand = {action, ...bodyObj};
            const {uid} = command.payload || {uid: -1};

            this._sendReceipt(headers).catch(console.warn);

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                await this.mainApplication.deleteApplication(uid, this.session);
              }
            });
            break;
          }
          case "CREATE_APP": {  // TODO tmp
            const command: CreateAppCommand = {action, ...bodyObj};
            const {alias} = command.payload || {alias: "Unknown"};

            this._sendReceipt(headers).catch(console.warn);

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                const uid = await this.mainApplication.createApplication(alias, this.session);
                return await this.mainApplication.getApplicationInfo(uid, this.session);
              }
            });
            break;
          }
          case "GET_APPS": {  // TODO tmp
            const command: GetAppsCommand = {action, payload: undefined};

            this._sendReceipt(headers).catch(console.warn);

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                return await this.mainApplication.getApplicationsInfo(this.session);
              }
            });
            break;
          }
          // ------------------------------For all applications
          case "PING": {
            const defaultPayload: PingCommand["payload"] = {steps: 1, delay: 0};
            const command: PingCommand = {action, payload: defaultPayload, ...bodyObj};
            const steps = command.payload.steps || defaultPayload.steps;
            const delay = command.payload.delay || defaultPayload.delay;

            this._sendReceipt(headers).catch(console.warn);

            this.session.taskManager.add({
              command,
              destination,
              worker: async (checkStatus, progress) => {
                const stepPercent = 100 / steps;
                for (let i = 0; i < steps; i++) {
                  await new Promise((resolve) => setTimeout(resolve, delay));
                  progress.increment(stepPercent, `Process ping... Complete step: ${i + 1}`);
                  await checkStatus();
                }

                if (!this.application.connected) {
                  throw new Error("Application is not connected");
                }
              }
            });
            break;
          }
          case "GET_SCHEMA": {
            const command: GetSchemaCommand = {action, payload: undefined};

            this._sendReceipt(headers).catch(console.warn);

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => this.application.erModel.serialize()
            });
            break;
          }
          case "QUERY": {
            const command: QueryCommand = {action, ...bodyObj};

            this._sendReceipt(headers).catch(console.warn);

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

  public ack(headers: StompHeaders = {}): void {
    if (headers.id !== StompSession.IGNORED_ACK_ID) {
      const task = this.session.taskManager.find(headers.id);
      if (task) {
        this.session.taskManager.delete(task);
      }
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

  protected async _internalConnect(headers: StompHeaders): Promise<void> {
    const {login, passcode, access_token, authorization, "app-uid": appUid, "create-user": isCreateUser} = headers;

    // authorization
    let result: { userKey: number, newTokens?: ITokens };
    if (login && passcode && isCreateUser) {
      result = await Utils.createUser(this.mainApplication, login, passcode);
    } else if (login && passcode) {
      result = await Utils.login(this.mainApplication, login, passcode);
    } else if (authorization || access_token) { // TODO remove access_token
      result = await Utils.authorize(this.mainApplication, authorization || access_token);
    } else {
      throw new Error("Unauthorized");
    }

    // get application from main
    this._application = await Utils.getApplication(this.mainApplication, result.userKey, appUid);
    if (!this._application.connected) {
      await this._application.connect();
    }

    // create session for application
    this._session = await this.application.sessionManager.get(result.userKey);
    if (!this._session) {
      this._session = await this.application.sessionManager.open(result.userKey);
    }
    this._session.borrow();
    this._session.taskManager.addChangeStatusListener(this);

    await this._sendConnected(result.newTokens || {});
  }

  protected async _sendTaskMessage(task: Task<any, any, any>): Promise<void> {
    const subscription = this._subscriptions.find((sub) => sub.destination === task.options.destination);
    if (subscription) {
      const ack = endStatuses.includes(task.status) ? task.id : StompSession.IGNORED_ACK_ID;

      const headers: StompHeaders = {
        "content-type": "application/json;charset=utf-8",
        "destination": task.options.destination,
        "action": task.options.command.action,
        "subscription": subscription.id,
        "message-id": ack
      };
      if (subscription.ack !== "auto") {
        headers.ack = ack;
      }

      await this._stomp.message(headers, JSON.stringify({
        status: task.status,
        progress: task.status === TaskStatus.RUNNING ? {
          value: task.progress.value,
          description: task.progress.description
        } : undefined,
        payload: task.options.command.payload,
        result: task.result ? task.result : undefined,
        errorMessage: task.error ? task.error.message : undefined
      }));

      if (subscription.ack === "auto") {
        this.session.taskManager.delete(task);
      }
    }
  }

  protected async _sendConnected(headers: StompHeaders): Promise<void> {
    const pack = require("../../package.json");
    await this._stomp.connected({
      server: `${pack.name}/${pack.version}`,
      session: this.session.id,
      ...headers
    });
  }

  protected async _sendError(error: Error, requestHeaders: StompHeaders): Promise<void> {
    const errorHeaders: StompHeaders = {message: error.message};
    if (requestHeaders && requestHeaders.receipt) {
      errorHeaders["receipt-id"] = requestHeaders.receipt;
    }
    await this._stomp.error(errorHeaders);
  }

  protected async _sendReceipt(requestHeaders: StompHeaders): Promise<void> {
    const receiptHeaders: StompHeaders = {};
    if (requestHeaders && requestHeaders.receipt) {
      receiptHeaders["receipt-id"] = requestHeaders.receipt;
      await this._stomp.receipt(receiptHeaders);
    }
  }
}
