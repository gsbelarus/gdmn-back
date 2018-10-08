import {Session} from "./base/Session";
import {TaskFactory} from "./base/TaskFactory";
import {IApplicationInfoOutput, IOptionalConnectionOptions, MainApplication} from "./MainApplication";
import {ICommand, Task} from "./base/task/Task";

export type MainAction = "DELETE_APP" | "CREATE_APP" | "GET_APPS";

export type Command<A extends MainAction, P> = ICommand<A, P>;

export type DeleteAppCommand = Command<"DELETE_APP", { uid: string }>;
export type CreateAppCommand = Command<"CREATE_APP", { alias: string, connectionOptions?: IOptionalConnectionOptions }>;
export type GetAppsCommand = Command<"GET_APPS", undefined>;

export class MainTaskFactory extends TaskFactory {

  constructor(application: MainApplication) {
    super(application);
  }

  get application(): MainApplication {
    return super.application as MainApplication;
  }

  public deleteApplication(session: Session,
                           command: DeleteAppCommand
  ): Task<DeleteAppCommand["action"], DeleteAppCommand["payload"], void> {
    return new Task({
      session,
      command,
      worker: (context) => this.application.deleteApplication(command.payload.uid, context.session)
    });
  }

  public createApplication(session: Session,
                           command: CreateAppCommand
  ): Task<CreateAppCommand["action"], CreateAppCommand["payload"], IApplicationInfoOutput> {
    return new Task({
      session,
      command,
      worker: async (context) => {
        const {alias, connectionOptions} = command.payload;
        const uid = await this.application.createApplication(alias, context.session, connectionOptions);
        return await this.application.getApplicationInfo(uid, context.session);
      }
    });
  }

  public getApplications(session: Session,
                         command: GetAppsCommand
  ): Task<GetAppsCommand["action"], GetAppsCommand["payload"], IApplicationInfoOutput[]> {
    return new Task({
      session,
      command,
      worker: (context) => this.application.getApplicationsInfo(context.session)
    });
  }
}
