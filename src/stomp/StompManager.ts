import http from "http";
import {createStompServerSession, setLoggingListeners} from "node-stomp-protocol";
import {parse} from "url";
import WebSocket from "ws";
import {MainApplication} from "../apps/MainApplication";
import {MainStompSession} from "./MainStompSession";
import {StompSession} from "./StompSession";

setLoggingListeners({
  error: console.log,
  info: console.log,
  silly: (message, args) => {
    const receiverDataTemplate = /^StompWebSocketStreamLayer: received data %.$/g;
    if (receiverDataTemplate.test(message)) {
      console.log(`>>> ${args}`);
    }
    const sendingDataTemplate = /^StompFrameLayer: sending frame data %.$/g;
    if (sendingDataTemplate.test(message)) {
      console.log(`<<< ${args}`);
    }
  },
  warn: console.log,
  debug: () => ({})
});

export class StompManager {

  private readonly _mainApplication = new MainApplication();

  private _sessions = new Map<WebSocket, StompSession>();

  get mainApplication(): MainApplication {
    return this._mainApplication;
  }

  public add(webSocket: WebSocket, req: http.IncomingMessage): boolean {
    let stomp;
    let session;

    const query = parse(req.url!).query || "";
    const groupParams = query.split("&").map((group) => group.split("="));
    const groupUid = groupParams.find((group) => group[0] === "uid");

    if (groupUid) {
      try {
        stomp = createStompServerSession(webSocket, StompSession);
        session = stomp.listener as StompSession;
        session.application = this._mainApplication.getApplicationSync(groupUid[1]);
        if (!session.application.connected) {
          throw new Error("Application is not connected");
        }
      } catch (error) {
        webSocket.close(1003, error.message);
        return false;
      }
    } else {
      stomp = createStompServerSession(webSocket, MainStompSession);
      session = stomp.listener as MainStompSession;
      session.application = this._mainApplication;
    }
    this._sessions.set(webSocket, session);
    return true;
  }

  public delete(webSocket: WebSocket): void {
    const session = this._sessions.get(webSocket);
    if (!session) {
      throw new Error("WebSocket not found");
    }
    session.application = this._mainApplication;
    this._sessions.delete(webSocket);
  }

  public async create(): Promise<void> {
    await this._mainApplication.createOrConnect();
  }

  public async destroy(): Promise<void> {
    await this._mainApplication.disconnect();
  }
}
