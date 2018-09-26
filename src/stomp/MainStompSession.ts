import {StompHeaders} from "node-stomp-protocol";
import {MainApplication} from "../apps/MainApplication";
import {ICommand, StompSession} from "./StompSession";

type Action = "INIT_APP" | "DELETE_APP" | "CREATE_APP";

type Command<A extends Action, P> = ICommand<A, P>;

type InitAppCommand = Command<"INIT_APP", { uid: string }>;
type DeleteAppCommand = Command<"DELETE_APP", { uid: string }>;
type CreateAppCommand = Command<"CREATE_APP", { alias: string }>;

export class MainStompSession extends StompSession {

  get application(): MainApplication {
    return super.application as MainApplication;
  }

  set application(value: MainApplication) {
    super.application = value;
  }

  public send(headers?: StompHeaders, body?: string): void {
    console.log("Send!", body, headers);
    const action = headers!.action as Action;
    switch (action) {
      case "INIT_APP": {
        this._checkDestination(headers!.destination, StompSession.TOPIC_TASK);
        const initAppCommand: InitAppCommand = {action, payload: JSON.parse(body!)};
        const {uid} = initAppCommand.payload;

        this.session.taskManager.add({
          action: initAppCommand.action,
          destination: headers!.destination,
          worker: async (checkStatus) => {
            const application = await this.application.getApplication(uid, this.session);
            if (!application.connected) {
              await application.connect();
            }
            await checkStatus();
          }
        });
        break;
      }
      case "DELETE_APP": {
        this._checkDestination(headers!.destination, StompSession.TOPIC_TASK);
        const deleteAppCommand: DeleteAppCommand = {action, payload: JSON.parse(body!)};
        const {uid} = deleteAppCommand.payload;

        this.session.taskManager.add({
          action: deleteAppCommand.action,
          destination: headers!.destination,
          worker: async () => {
            await this.application.deleteApplication(uid, this.session);
          }
        });
        break;
      }
      case "CREATE_APP": {
        this._checkDestination(headers!.destination, StompSession.TOPIC_TASK);
        const createAppCommand: CreateAppCommand = {action, payload: JSON.parse(body!)};
        const {alias} = createAppCommand.payload;

        this.session.taskManager.add({
          action: createAppCommand.action,
          destination: headers!.destination,
          worker: async () => {
            return await this.application.createApplication(alias, this.session);
          }
        });
        break;
      }
      default:
        super.send(headers, body);
    }
  }
}
