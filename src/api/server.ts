import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import type { AppConfig } from "../config/config";
import type { SteamService } from "../services/steamService";
import type { GameDb } from "../services/gameDb";
import type { WsServer } from "./wsServer";
import { buildRoutes } from "./routes";

const isApiPath = (reqPath: string): boolean =>
  reqPath === "/api" ||
  reqPath.startsWith("/api/") ||
  reqPath === "/health" ||
  reqPath === "/ws";

export class ApiServer {
  private httpServer?: HttpServer;

  constructor(
    private readonly logger: Logger,
    private readonly config: AppConfig,
    private readonly steamService: SteamService,
    private readonly wsServer: WsServer,
    private readonly gameDb: GameDb,
  ) {}

  start(): void {
    if (!this.config.apiEnabled || this.httpServer) return;

    const app = express();
    app.disable("x-powered-by");

    app.use((_req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      next();
    });

    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      if (req.method === "OPTIONS") { res.sendStatus(204); return; }
      next();
    });

    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        this.logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }, "http");
      });
      next();
    });

    app.use(express.json({ limit: "100kb" }));
    app.use("/", buildRoutes({ steamService: this.steamService, logger: this.logger, config: this.config, gameDb: this.gameDb }));

    if (this.config.dashboardStaticEnabled) {
      const staticDir    = this.config.dashboardStaticDir;
      const indexFile    = path.join(staticDir, "index.html");
      const hasStatic    = fs.existsSync(staticDir) && fs.existsSync(indexFile);

      if (hasStatic) {
        app.use(express.static(staticDir, { index: false, maxAge: "1h", etag: true }));

        app.get("*", (req, res, next) => {
          if (req.method !== "GET" || isApiPath(req.path) || path.extname(req.path)) {
            next(); return;
          }
          if (!(req.header("accept") ?? "").includes("text/html")) { next(); return; }
          res.sendFile(indexFile);
        });

        this.logger.info({ staticDir }, "Dashboard static files enabled.");
      } else {
        this.logger.warn({ staticDir }, "DASHBOARD_STATIC_ENABLED=true but static files not found. Run pnpm run build:all first.");
      }
    }

    this.httpServer = createServer(app);
    this.wsServer.attach(this.httpServer);

    this.httpServer.listen(this.config.apiPort, this.config.apiHost, () => {
      this.logger.info({ host: this.config.apiHost, port: this.config.apiPort }, "Dark Booster server started.");
    });

    this.httpServer.on("error", (error: NodeJS.ErrnoException) => {
      this.logger.error({ code: error.code, message: error.message }, "Server failed to start.");
      setImmediate(() => process.exit(1));
    });
  }

  async stop(): Promise<void> {
    this.wsServer.close();
    if (!this.httpServer) return;

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((err?: Error) => (err ? reject(err) : resolve()));
    });
    this.httpServer = undefined;
  }
}
