import {createStompServerSession, setLoggingListeners} from "node-stomp-protocol";
import WebSocket from "ws";
import {MainApplication} from "../apps/MainApplication";
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

  public add(webSocket: WebSocket): boolean {
    const stomp = createStompServerSession(webSocket, StompSession);
    const session = stomp.listener as StompSession;
    session.mainApplication = this._mainApplication;
    this._sessions.set(webSocket, session);
    return true;
  }

  public delete(webSocket: WebSocket): void {
    const session = this._sessions.get(webSocket);
    if (!session) {
      throw new Error("WebSocket not found");
    }
    this._sessions.delete(webSocket);
  }

  public async create(): Promise<void> {
    await this._mainApplication.createOrConnect();
  }

  public async destroy(): Promise<void> {
    await this._mainApplication.disconnect();
  }
}
