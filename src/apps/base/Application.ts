import {AccessMode, AConnection, DBStructure} from "gdmn-db";
import {DataSource, ERBridge, IQueryResponse} from "gdmn-er-bridge";
import {ERModel, IEntityQueryInspector, IERModel} from "gdmn-orm";
import {Database, IDBDetail} from "../../db/Database";
import {Session} from "./Session";
import {SessionManager} from "./SessionManager";
import {ICommand, Task} from "./task/Task";

export type AppAction = "PING" | "GET_SCHEMA" | "QUERY";

export type AppCommand<A extends AppAction, P = any> = ICommand<A, P>;

export type PingCommand = AppCommand<"PING", { steps: number, delay: number }>;
export type GetSchemaCommand = AppCommand<"GET_SCHEMA", undefined>;
export type QueryCommand = AppCommand<"QUERY", IEntityQueryInspector>;

export abstract class Application extends Database {

  private readonly _sessionManager = new SessionManager(this.connectionPool);

  private _dbStructure: DBStructure = new DBStructure();
  private _erModel: ERModel = new ERModel();

  protected constructor(dbDetail: IDBDetail) {
    super(dbDetail);
  }

  get dbStructure(): DBStructure {
    return this._dbStructure;
  }

  get erModel(): ERModel {
    return this._erModel;
  }

  get sessionManager(): SessionManager {
    return this._sessionManager;
  }

  public pushPingCommand(session: Session, command: PingCommand): Task<PingCommand, void> {
    this._checkSession(session);
    this._checkBusy();

    const task = new Task({
      session,
      command,
      worker: async (context) => {
        const {steps, delay} = context.command.payload;

        const stepPercent = 100 / steps;
        context.progress.increment(0, `Process ping...`);
        for (let i = 0; i < steps; i++) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          context.progress.increment(stepPercent, `Process ping... Complete step: ${i + 1}`);
          await context.checkStatus();
        }

        if (!this.connected) {
          throw new Error("Application is not connected");
        }
      }
    });
    return session.taskManager.add(task);
  }

  public pushGetSchemaCommand(session: Session, command: GetSchemaCommand): Task<GetSchemaCommand, IERModel> {
    this._checkSession(session);
    this._checkBusy();

    const task = new Task({
      session,
      command,
      worker: () => this.erModel.serialize()
    });
    return session.taskManager.add(task);
  }

  public pushQueryCommand(session: Session, command: QueryCommand): Task<QueryCommand, IQueryResponse> {
    this._checkSession(session);
    this._checkBusy();

    const task = new Task({
      session,
      command,
      worker: async (context) => {
        const result = await new ERBridge(context.session.connection)
          .query(this._erModel, this._dbStructure, context.command.payload);
        await context.checkStatus();
        return result;
      }
    });
    return session.taskManager.add(task);
  }

  public async reload(): Promise<void> {
    this._checkBusy();

    await this._reload();
  }

  protected _checkSession(session: Session): void | never {
    if (session.softClosed || !session.active) {
      throw new Error("Session is closed");
    }
    if (!this._sessionManager.includes(session)) {
      throw new Error("Session does not belong to the application");
    }
  }

  protected async _reload(): Promise<void> {
    await this._executeConnection(async (connection) => {
      await new ERModel().initDataSource(new DataSource(connection));

      await AConnection.executeTransaction({
        connection,
        options: {accessMode: AccessMode.READ_ONLY},
        callback: async (transaction) => {

          console.time("DBStructure load time");
          this._dbStructure = await this.dbDetail.driver.readDBStructure(connection, transaction);
          console.log(`DBStructure: ${Object.entries(this._dbStructure.relations).length} relations loaded...`);
          console.timeEnd("DBStructure load time");

          console.time("erModel load time");
          const erBridge = new ERBridge(connection);
          await erBridge.exportFromDatabase(this._dbStructure, transaction, this._erModel = new ERModel());
          console.log(`erModel: loaded ${Object.entries(this._erModel.entities).length} entities`);
          console.timeEnd("erModel load time");
        }
      });
    });
  }

  protected async _onCreate(_connection: AConnection): Promise<void> {
    await super._onCreate(_connection);

    await this._erModel.initDataSource(new DataSource(_connection));
  }

  protected async _onConnect(): Promise<void> {
    await super._onConnect();

    await this._reload();
  }

  protected async _onDisconnect(): Promise<void> {
    await super._onDisconnect();

    await this._sessionManager.closeAll();
  }
}
