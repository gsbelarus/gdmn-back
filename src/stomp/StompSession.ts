import {IEntityQueryInspector} from "gdmn-orm";
import {StompClientCommandListener, StompError, StompHeaders, StompServerSessionLayer} from "node-stomp-protocol";
import {Application} from "../apps/Application";
import {IOptionalConnectionOptions, MainApplication} from "../apps/MainApplication";
import {Session} from "../apps/Session";
import {endStatuses, ICommand, IEvents, Task} from "../apps/task/Task";
import {ErrorCode, ServerError} from "./ServerError";
import {ITokens, Utils} from "./Utils";

type Action = "DELETE_APP" | "CREATE_APP" | "GET_APPS" |
  "PING" | "GET_SCHEMA" | "QUERY";

type Command<A extends Action, P> = ICommand<A, P>;

type DeleteAppCommand = Command<"DELETE_APP", { uid: string }>;
type CreateAppCommand = Command<"CREATE_APP", { alias: string, connectionOptions?: IOptionalConnectionOptions }>;
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

export interface IConnectHeaders {
  session?: string;
  login?: string;
  passcode?: string;
  access_token?: string;
  authorization?: string;
  "app-uid"?: string;
  "create-user"?: number;
}

export class StompSession implements StompClientCommandListener {

  public static readonly DESTINATION_TASK = "/task";
  public static readonly IGNORED_ACK_ID = "ignored-id";

  private readonly _stomp: StompServerSessionLayer;
  private readonly _subscriptions: ISubscription[] = [];
  private readonly _onChangeTask: IEvents<any, any, any>["change"];
  private readonly _onProgressTask: IEvents<any, any, any>["progress"];

  private _session?: Session;
  private _application?: Application;
  private _mainApplication?: MainApplication;

  constructor(session: StompServerSessionLayer) {
    this._stomp = session;
    this._onChangeTask = (task: Task<any, any, any>) => this._sendTaskMessage(task);
    this._onProgressTask = (task: Task<any, any, any>) => this._sendTaskMessage(task, true);
  }

  get application(): Application {
    if (!this._application) {
      throw new ServerError(ErrorCode.NOT_FOUND, "Application is not found");
    }
    return this._application;
  }

  set application(value: Application) {
    this._application = value;
  }

  get mainApplication(): MainApplication {
    if (!this._mainApplication) {
      throw new ServerError(ErrorCode.NOT_FOUND, "MainApplication is not found");
    }
    return this._mainApplication;
  }

  set mainApplication(value: MainApplication) {
    this._mainApplication = value;
  }

  get session(): Session {
    if (!this._session) {
      throw new ServerError(ErrorCode.NOT_FOUND, "Session is not found");
    }
    return this._session;
  }

  get stomp(): StompServerSessionLayer {
    return this._stomp;
  }

  get subscriptions(): ISubscription[] {
    return this._subscriptions;
  }

  public connect(headers: StompHeaders): void {
    this._internalConnect(headers).catch((error) => this._sendError(error, headers));
  }

  public disconnect(headers: StompHeaders): void {
    this._try(() => {
      this._releaseResources();
      this._sendReceipt(headers);
    }, headers);
  }

  public onEnd(): void {
    console.log("End");
    this._releaseResources();
  }

  public onProtocolError(error: StompError): void {
    console.log("Protocol Error", error);
    this._releaseResources();
  }

  public subscribe(headers: StompHeaders): void {
    this._try(() => {
      if (this._subscriptions.some((sub) => sub.id === headers.id)) {
        throw new ServerError(ErrorCode.NOT_UNIQUE, "Subscriptions with same id exists");
      }
      if (this._subscriptions.some((sub) => sub.destination === headers.destination)) {
        throw new ServerError(ErrorCode.NOT_UNIQUE, "Subscriptions with same destination exists");
      }
      switch (headers.destination) {
        case StompSession.DESTINATION_TASK:
          this._subscriptions.push({
            id: headers.id,
            destination: headers.destination,
            ack: headers.ack as Ack || "auto"
          });
          this.session.taskList.emitter.addListener("change", this._onChangeTask);
          this.session.taskList.emitter.addListener("progress", this._onProgressTask);

          this._sendReceipt(headers);

          // notify about taskList
          this.session.taskList.getAll().forEach((task) => this._onChangeTask(task));
          break;
        default:
          throw new ServerError(ErrorCode.UNSUPPORTED, `Unsupported destination '${headers.destination}'`);
      }
    }, headers);
  }

  public unsubscribe(headers: StompHeaders): void {
    this._try(() => {
      const subscription = this._subscriptions.find((sub) => sub.id === headers.id);
      if (!subscription) {
        throw new ServerError(ErrorCode.NOT_FOUND, "Subscription is not found");
      }
      switch (headers.destination) {
        case StompSession.DESTINATION_TASK:
          this.session.taskList.emitter.removeListener("progress", this._onProgressTask);
          this.session.taskList.emitter.removeListener("change", this._onChangeTask);
          this._subscriptions.splice(this._subscriptions.indexOf(subscription), 1);

          this._sendReceipt(headers);
          break;
        default:
          throw new ServerError(ErrorCode.UNSUPPORTED, `Unsupported destination '${headers.destination}'`);
          break;
      }
    }, headers);
  }

  public send(headers: StompHeaders, body: string = ""): void {
    this._try(() => {
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

              const task = this.session.taskList.add(new Task({
                session: this.session,
                command,
                destination,
                worker: (context) => this.mainApplication.deleteApplication(uid, context.session)
              }));
              this._sendReceipt(headers);

              task.execute().catch(console.error);
              break;
            }
            case "CREATE_APP": {  // TODO tmp
              const command: CreateAppCommand = {action, ...bodyObj};
              const {alias, connectionOptions} = command.payload || {alias: "Unknown", connectionOptions: undefined};

              const task = this.session.taskList.add(new Task({
                session: this.session,
                command,
                destination,
                worker: async (context) => {
                  const uid = await this.mainApplication.createApplication(alias, context.session, connectionOptions);
                  return await this.mainApplication.getApplicationInfo(uid, context.session);
                }
              }));
              this._sendReceipt(headers);

              task.execute().catch(console.error);
              break;
            }
            case "GET_APPS": {  // TODO tmp
              const command: GetAppsCommand = {action, payload: undefined};

              const task = this.session.taskList.add(new Task({
                session: this.session,
                command,
                destination,
                worker: async (context) => {
                  return await this.mainApplication.getApplicationsInfo(context.session);
                }
              }));
              this._sendReceipt(headers);

              task.execute().catch(console.error);
              break;
            }
            // ------------------------------For all applications
            case "PING": {
              const defaultPayload: PingCommand["payload"] = {steps: 1, delay: 0};
              const command: PingCommand = {action, payload: defaultPayload, ...bodyObj};
              const steps = command.payload.steps || defaultPayload.steps;
              const delay = command.payload.delay || defaultPayload.delay;

              const task = this.session.taskList.add(new Task({
                session: this.session,
                command,
                destination,
                worker: async (context) => {
                  const stepPercent = 100 / steps;
                  context.progress.increment(0, `Process ping...`);
                  for (let i = 0; i < steps; i++) {
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    context.progress.increment(stepPercent, `Process ping... Complete step: ${i + 1}`);
                    await context.checkStatus();
                  }

                  if (!this.application.connected) {
                    throw new Error("Application is not connected");
                  }
                }
              }));
              this._sendReceipt(headers);

              task.execute().catch(console.error);
              break;
            }
            case "GET_SCHEMA": {
              const command: GetSchemaCommand = {action, payload: undefined};

              const task = this.session.taskList.add(new Task({
                session: this.session,
                command,
                destination,
                worker: () => this.application.erModel.serialize()
              }));
              this._sendReceipt(headers);

              task.execute().catch(console.error);
              break;
            }
            case "QUERY": {
              const command: QueryCommand = {action, ...bodyObj};

              const task = this.session.taskList.add(new Task({
                session: this.session,
                command,
                destination,
                worker: async (context) => {
                  const result = this.application.query(command.payload, context.session);
                  await context.checkStatus();
                  return result;
                }
              }));
              this._sendReceipt(headers);

              task.execute().catch(console.error);
              break;
            }
            default:
              throw new ServerError(ErrorCode.UNSUPPORTED, "Unsupported action");
          }
          break;
        default:
          throw new ServerError(ErrorCode.UNSUPPORTED, `Unsupported destination '${destination}'`);
      }
    }, headers);
  }

  public ack(headers: StompHeaders): void {
    this._try(() => {
      if (headers.id !== StompSession.IGNORED_ACK_ID) {
        const task = this.session.taskList.find(headers.id);
        if (task) {
          this.session.taskList.remove(task);
        }
      }
    }, headers);
  }

  public nack(headers: StompHeaders): void {
    this._try(() => {
      throw new ServerError(ErrorCode.UNSUPPORTED, "Unsupported yet");
    }, headers);
  }

  public begin(headers: StompHeaders): void {
    this._try(() => {
      throw new ServerError(ErrorCode.UNSUPPORTED, "Unsupported yet");
    }, headers);
  }

  public commit(headers: StompHeaders): void {
    this._try(() => {
      throw new ServerError(ErrorCode.UNSUPPORTED, "Unsupported yet");
    }, headers);
  }

  public abort(headers: StompHeaders): void {
    this._try(() => {
      throw new ServerError(ErrorCode.UNSUPPORTED, "Unsupported yet");
    }, headers);
  }

  protected async _internalConnect(headers: StompHeaders): Promise<void> {
    const {session, login, passcode, access_token, authorization, "app-uid": appUid, "create-user": isCreateUser}
      = headers as IConnectHeaders;

    // authorization
    let result: { userKey: number, newTokens?: ITokens };
    if (login && passcode && isCreateUser) {
      result = await Utils.createUser(this.mainApplication, login, passcode);
    } else if (login && passcode) {
      result = await Utils.login(this.mainApplication, login, passcode);
    } else if (authorization || access_token) { // TODO remove access_token
      result = await Utils.authorize(this.mainApplication, authorization || access_token!);
    } else {
      throw new ServerError(ErrorCode.UNAUTHORIZED, "Incorrect headers");
    }

    // get application from main
    this._application = await Utils.getApplication(this.mainApplication, result.userKey, appUid);
    if (!this._application.connected) {
      await this._application.connect();
    }

    // create session for application
    if (session) {
      this._session = await this.application.sessionManager.find(session, result.userKey);
      if (!this._session) {
        throw new ServerError(ErrorCode.NOT_FOUND, "Session is not found");
      }
    } else if (!this._session) {
      this._session = await this.application.sessionManager.open(result.userKey);
    }
    this._session.borrow();

    this._sendConnected(result.newTokens || {});
  }

  protected _sendTaskMessage(task: Task<any, any, any>, progress?: boolean): void {
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

      this._stomp.message(headers, JSON.stringify({
        status: task.status,
        progress: progress ? {
          value: task.progress.value,
          description: task.progress.description
        } : undefined,
        payload: task.options.command.payload,
        result: task.result ? task.result : undefined,
        error: task.error ? {
          code: task.error.code,
          message: task.error.message
        } : undefined
      })).catch(console.warn);

      if (subscription.ack === "auto") {
        this.session.taskList.remove(task);
      }
    }
  }

  protected _sendConnected(headers: StompHeaders): void {
    const pack = require("../../package.json");
    this._stomp.connected({
      server: `${pack.name}/${pack.version}`,
      session: this.session.id,
      ...headers
    }).catch(console.warn);
  }

  protected _sendError(error: ServerError, requestHeaders?: StompHeaders): void {
    const errorHeaders: StompHeaders = {code: `${error.code}`, message: error.message};
    if (requestHeaders && requestHeaders.receipt) {
      errorHeaders["receipt-id"] = requestHeaders.receipt;
    }
    this._stomp.error(errorHeaders).catch(console.warn);
    this._releaseResources(); // TODO issue #25
  }

  protected _sendReceipt(requestHeaders: StompHeaders): void {
    const receiptHeaders: StompHeaders = {};
    if (requestHeaders.receipt) {
      receiptHeaders["receipt-id"] = requestHeaders.receipt;
      this._stomp.receipt(receiptHeaders).catch(console.warn);
    }
  }

  protected _releaseResources(): void {
    if (this._session) {
      console.log("Resource is released");
      this._subscriptions.splice(0, this._subscriptions.length);
      this.session.taskList.emitter.removeListener("progress", this._onProgressTask);
      this.session.taskList.emitter.removeListener("change", this._onChangeTask);
      this._session.release();
      this._session = undefined;
    }
  }

  protected _try(callback: () => void, requestHeaders: StompHeaders): void | never {
    try {
      callback();
    } catch (error) {
      if (error instanceof ServerError) {
        this._sendError(error, requestHeaders);
      } else {
        this._sendError(new ServerError(ErrorCode.INTERNAL, error.message), requestHeaders);
      }
    }
  }
}
