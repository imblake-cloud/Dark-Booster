import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import type { Logger } from "pino";
import type { SteamManager } from "../core/steamManager";

type WsMessage =
  | { type: "status"; data: ReturnType<SteamManager["getAllSnapshots"]> }
  | { type: "guards"; data: ReturnType<SteamManager["getPendingGuardChallenges"]> };

export class WsServer {
  private wss?: WebSocketServer;

  constructor(
    private readonly logger: Logger,
    private readonly steamManager: SteamManager,
  ) {
    steamManager.on("state_change", () => {
      this.broadcast({ type: "status", data: steamManager.getAllSnapshots() });
    });

    steamManager.on("guards_change", () => {
      this.broadcast({ type: "guards", data: steamManager.getPendingGuardChallenges() });
    });
  }

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const ip = req.socket.remoteAddress ?? "unknown";
      this.logger.debug({ ip }, "WebSocket client connected.");

      ws.send(JSON.stringify({ type: "status", data: this.steamManager.getAllSnapshots() }));
      ws.send(JSON.stringify({ type: "guards", data: this.steamManager.getPendingGuardChallenges() }));

      ws.on("close", () => {
        this.logger.debug({ ip }, "WebSocket client disconnected.");
      });

      ws.on("error", (err) => {
        this.logger.warn({ ip, err: err.message }, "WebSocket client error.");
      });
    });

    this.logger.info("WebSocket server attached at /ws");
  }

  close(): void {
    this.wss?.close();
  }

  private broadcast(msg: WsMessage): void {
    if (!this.wss) return;
    const payload = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
