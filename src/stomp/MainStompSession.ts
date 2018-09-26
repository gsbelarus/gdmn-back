import {StompHeaders} from "node-stomp-protocol";
import {MainApplication} from "../apps/MainApplication";
import {ICommand} from "../apps/task/Task";
import {StompSession} from "./StompSession";

type Action = "INIT_APP" | "DELETE_APP" | "CREATE_APP" | "GET_APPS";

type Command<A extends Action, P> = ICommand<A, P>;

type InitAppCommand = Command<"INIT_APP", { uid: string }>;
type DeleteAppCommand = Command<"DELETE_APP", { uid: string }>;
type CreateAppCommand = Command<"CREATE_APP", { alias: string }>;
type GetAppsCommand = Command<"GET_APPS", undefined>;

export class MainStompSession extends StompSession {

  get application(): MainApplication {
    return super.application as MainApplication;
  }

  set application(value: MainApplication) {
    super.application = value;
  }

  public send(headers?: StompHeaders, body?: string): void {
    const destination = headers!.destination;

    switch (destination) {
      case StompSession.DESTINATION_TASK:
        this._checkContentType(headers);

        const action = headers!.action as Action;
        const bodyObj = JSON.parse(body!);

        switch (action) {
          case "INIT_APP": {
            const command: InitAppCommand = {action, ...bodyObj};
            const {uid} = command.payload;

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                const application = await this.application.getApplication(uid, this.session);
                if (!application.connected) {
                  await application.connect();
                }
                return await this.application.getApplicationInfo(uid, this.session);
              }
            });
            break;
          }
          case "DELETE_APP": {  // TODO tmp
            const command: DeleteAppCommand = {action, ...bodyObj};
            const {uid} = command.payload;

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                await this.application.deleteApplication(uid, this.session);
              }
            });
            break;
          }
          case "CREATE_APP": {  // TODO tmp
            const command: CreateAppCommand = {action, ...bodyObj};
            const {alias} = command.payload;

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                const uid = await this.application.createApplication(alias, this.session);
                return await this.application.getApplicationInfo(uid, this.session);
              }
            });
            break;
          }
          case "GET_APPS": {  // TODO tmp
            const command: GetAppsCommand = {action, payload: undefined};

            this.session.taskManager.add({
              command,
              destination,
              worker: async () => {
                return await this.application.getApplicationsInfo(this.session);
              }
            });
            break;
          }
          default:
            super.send(headers, body);
        }
        break;
      default:
        super.send(headers, body);
    }
  }
}
