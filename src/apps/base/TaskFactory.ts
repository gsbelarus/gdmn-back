import {IQueryResponse} from "gdmn-er-bridge";
import {IEntityQueryInspector, IERModel} from "gdmn-orm";
import {ICommand, Task} from "./task/Task";
import {Application} from "./Application";
import {Session} from "./Session";

export type Action = "PING" | "GET_SCHEMA" | "QUERY";

export type Command<A extends Action, P> = ICommand<A, P>;

export type PingCommand = Command<"PING", { steps: number, delay: number }>;
export type GetSchemaCommand = Command<"GET_SCHEMA", undefined>;
export type QueryCommand = Command<"QUERY", IEntityQueryInspector>;

export class TaskFactory {

  private readonly _application: Application;

  constructor(application: Application) {
    this._application = application;
  }

  get application(): Application {
    return this._application;
  }

  public ping(session: Session,
              command: PingCommand
  ): Task<PingCommand["action"], PingCommand["payload"], void> {
    return new Task({
      session,
      command,
      worker: async (context) => {
        const {steps, delay} = command.payload;
        const stepPercent = 100 / steps;
        context.progress.increment(0, `Process ping...`);
        for (let i = 0; i < steps; i++) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          context.progress.increment(stepPercent, `Process ping... Complete step: ${i + 1}`);
          await context.checkStatus();
        }

        if (!this._application.connected) {
          throw new Error("Application is not connected");
        }
      }
    });
  }

  public getSchema(session: Session,
                   command: GetSchemaCommand
  ): Task<GetSchemaCommand["action"], GetSchemaCommand["payload"], IERModel> {
    return new Task({
      session,
      command,
      worker: () => this._application.erModel.serialize()
    });
  }

  public query(session: Session,
               command: QueryCommand
  ): Task<QueryCommand["action"], QueryCommand["payload"], IQueryResponse> {
    return new Task({
      session,
      command,
      worker: async (context) => {
        const result = await this._application.query(command.payload, context.session);
        await context.checkStatus();
        return result;
      }
    });
  }
}
