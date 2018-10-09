import {StompClientCommandListener, StompError, StompHeaders, StompServerSessionLayer} from "node-stomp-protocol";
import {v1 as uuidV1} from "uuid";
import {AppAction, Application, GetSchemaCommand, PingCommand, QueryCommand} from "../apps/base/Application";
import {Session} from "../apps/base/Session";
import {endStatuses, Task, TaskStatus} from "../apps/base/task/Task";
import {ITaskManagerEvents} from "../apps/base/task/TaskManager";
import {CreateAppCommand, DeleteAppCommand, GetAppsCommand, MainAction, MainApplication} from "../apps/MainApplication";
import {ErrorCode, ServerError} from "./ServerError";
import {ITokens, Utils} from "./Utils";

type Actions = AppAction | MainAction;

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
  public static readonly DESTINATION_TASK_STATUS = `${StompSession.DESTINATION_TASK}/status`;
  public static readonly DESTINATION_TASK_PROGRESS = `${StompSession.DESTINATION_TASK}/progress`;

  private readonly _stomp: StompServerSessionLayer;
  private readonly _subscriptions: ISubscription[] = [];
  private readonly _onChangeTask: ITaskManagerEvents["change"];
  private readonly _onProgressTask: ITaskManagerEvents["progress"];

  private _session?: Session;
  private _application?: Application;
  private _mainApplication?: MainApplication;

  constructor(session: StompServerSessionLayer) {
    this._stomp = session;
    this._onChangeTask = (task: Task<any, any>) => {
      const subscription = this._subscriptions
        .find((sub) => sub.destination === StompSession.DESTINATION_TASK_STATUS);
      if (subscription) {
        const ack = endStatuses.includes(task.status) ? task.id : uuidV1().toUpperCase();

        const headers: StompHeaders = {
          "content-type": "application/json;charset=utf-8",
          "destination": StompSession.DESTINATION_TASK_STATUS,
          "action": task.options.command.action,
          "subscription": subscription.id,
          "message-id": ack,
          "task-id": task.id
        };
        if (subscription.ack !== "auto") {
          headers.ack = ack;
        }

        this._stomp.message(headers, JSON.stringify({
          status: task.status,
          payload: task.options.command.payload,
          result: task.result ? task.result : undefined,
          error: task.error ? {
            code: task.error.code,
            message: task.error.message
          } : undefined
        })).catch(console.warn);

        if (subscription.ack === "auto") {
          this.session.taskManager.remove(task);
        }
      }
    };
    this._onProgressTask = (task: Task<any, any>) => {
      const subscription = this._subscriptions
        .find((sub) => sub.destination === StompSession.DESTINATION_TASK_PROGRESS);
      if (subscription) {
        const headers: StompHeaders = {
          "content-type": "application/json;charset=utf-8",
          "destination": StompSession.DESTINATION_TASK_PROGRESS,
          "action": task.options.command.action,
          "subscription": subscription.id,
          "message-id": uuidV1().toUpperCase(),
          "task-id": task.id
        };

        this._stomp.message(headers, JSON.stringify({
          payload: task.options.command.payload,
          progress: {
            value: task.progress.value,
            description: task.progress.description
          }
        })).catch(console.warn);
      }
    };
  }

  get application(): Application {
    if (!this._application) {
      throw new ServerError(ErrorCode.INTERNAL, "Application is not found");
    }
    return this._application;
  }

  set application(value: Application) {
    this._application = value;
  }

  get mainApplication(): MainApplication {
    if (!this._mainApplication) {
      throw new ServerError(ErrorCode.INTERNAL, "MainApplication is not found");
    }
    return this._mainApplication;
  }

  set mainApplication(value: MainApplication) {
    this._mainApplication = value;
  }

  get session(): Session {
    if (!this._session) {
      throw new ServerError(ErrorCode.UNAUTHORIZED, "Session is not found");
    }
    return this._session;
  }

  get stomp(): StompServerSessionLayer {
    return this._stomp;
  }

  get subscriptions(): ISubscription[] {
    return this._subscriptions;
  }

  public onProtocolError(error: StompError): void {
    console.log("Protocol Error", error);
    this.session.softClose();
  }

  public onEnd(): void {
    console.log("End");
    this._releaseResources();
  }

  public connect(headers: StompHeaders): void {
    this._internalConnect(headers).catch((error) => this._sendError(error, headers));
  }

  public disconnect(headers: StompHeaders): void {
    this._try(() => {
      this.session.softClose();
      this._sendReceipt(headers);
    }, headers);
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
        case StompSession.DESTINATION_TASK_STATUS: {
          this.session.taskManager.emitter.addListener("change", this._onChangeTask);
          this._subscriptions.push({
            id: headers.id,
            destination: headers.destination,
            ack: headers.ack as Ack || "auto"
          });
          this._sendReceipt(headers);

          // notify about taskManager
          this.session.taskManager.getAll().forEach((task) => this._onChangeTask(task));
          break;
        }
        case StompSession.DESTINATION_TASK_PROGRESS: {
          if (headers.ack && headers.ack !== "auto") {
            throw new ServerError(ErrorCode.UNSUPPORTED,
              `Unsupported ack mode '${headers.ack}'; supported - 'auto'`);
          }
          this.session.taskManager.emitter.addListener("progress", this._onProgressTask);
          this._subscriptions.push({
            id: headers.id,
            destination: headers.destination,
            ack: headers.ack as Ack || "auto"
          });
          this._sendReceipt(headers);

          this.session.taskManager.getAll().forEach((task) => {
            if (task.status === TaskStatus.RUNNING) {
              this._onProgressTask(task);
            }
          });
          break;
        }
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
        case StompSession.DESTINATION_TASK_STATUS:
          this.session.taskManager.emitter.removeListener("change", this._onChangeTask);
          this._subscriptions.splice(this._subscriptions.indexOf(subscription), 1);
          this._sendReceipt(headers);
          break;
        case StompSession.DESTINATION_TASK_PROGRESS:
          this.session.taskManager.emitter.removeListener("progress", this._onProgressTask);
          this._subscriptions.splice(this._subscriptions.indexOf(subscription), 1);
          this._sendReceipt(headers);
          break;
        default:
          throw new ServerError(ErrorCode.UNSUPPORTED, `Unsupported destination '${headers.destination}'`);
      }
    }, headers);
  }

  public send(headers: StompHeaders, body: string = ""): void {
    this._try(() => {
      const destination = headers.destination;

      switch (destination) {
        case StompSession.DESTINATION_TASK:
          Utils.checkContentType(headers);

          const action = headers.action as Actions;
          const bodyObj = JSON.parse(body || "{}");

          switch (action) {
            // ------------------------------For MainApplication
            case "DELETE_APP": {
              if (!bodyObj.payload || !bodyObj.uid) {
                throw new ServerError(ErrorCode.INVALID, "Payload must contains 'uid'");
              }
              const command: DeleteAppCommand = {action, ...bodyObj};
              const task = this.mainApplication.pushDeleteAppCommand(this.session, command);
              this._sendReceipt(headers, {"task-id": task.id});

              task.execute().catch(console.error);
              break;
            }
            case "CREATE_APP": {
              if (!bodyObj.payload || !bodyObj.alias) {
                throw new ServerError(ErrorCode.INVALID, "Payload must contains 'alias'");
              }
              const command: CreateAppCommand = {action, ...bodyObj};
              const task = this.mainApplication.pushCreateAppCommand(this.session, command);
              this._sendReceipt(headers, {"task-id": task.id});

              task.execute().catch(console.error);
              break;
            }
            case "GET_APPS": {
              const command: GetAppsCommand = {action, payload: undefined};
              const task = this.mainApplication.pushGetAppsCommand(this.session, command);
              this._sendReceipt(headers, {"task-id": task.id});

              task.execute().catch(console.error);
              break;
            }
            // ------------------------------For all applications
            case "PING": {
              const command: PingCommand = {
                action,
                payload: {
                  steps: bodyObj.payload.steps || 1,
                  delay: bodyObj.payload.delay || 0
                }
              };
              const task = this.application.pushPingCommand(this.session, command);
              this._sendReceipt(headers, {"task-id": task.id});

              task.execute().catch(console.error);
              break;
            }
            case "GET_SCHEMA": {
              const command: GetSchemaCommand = {action, payload: undefined};
              const task = this.application.pushGetSchemaCommand(this.session, command);
              this._sendReceipt(headers, {"task-id": task.id});

              task.execute().catch(console.error);
              break;
            }
            case "QUERY": {
              const command: QueryCommand = {action, ...bodyObj};
              const task = this.application.pushQueryCommand(this.session, command);
              this._sendReceipt(headers, {"task-id": task.id});

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
      const task = this.session.taskManager.find(headers.id);
      if (task) {
        this.session.taskManager.remove(task);
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
    } else {
      this._session = await this.application.sessionManager.open(result.userKey);
    }
    this.session.borrow();

    this._sendConnected(result.newTokens || {});
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
  }

  protected _sendReceipt(requestHeaders: StompHeaders, headers: StompHeaders = {}): void {
    const receiptHeaders: StompHeaders = headers;
    if (requestHeaders.receipt) {
      receiptHeaders["receipt-id"] = requestHeaders.receipt;
      this._stomp.receipt(receiptHeaders).catch(console.warn);
    }
  }

  protected _releaseResources(): void {
    if (this._session) {
      console.log("Resource is released");
      this._subscriptions.splice(0, this._subscriptions.length);
      this.session.taskManager.emitter.removeListener("progress", this._onProgressTask);
      this.session.taskManager.emitter.removeListener("change", this._onChangeTask);
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
