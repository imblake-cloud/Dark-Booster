import { Router, type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import { StealthMode } from "../models/enums";
import type { SteamService } from "../services/steamService";
import type { AppConfig } from "../config/config";
import type { GameDb } from "../services/gameDb";
import { parseAppIds } from "../utils/security";
import { ValidationError } from "../utils/errors";

interface RouteDependencies {
  steamService: SteamService;
  logger: Logger;
  config: AppConfig;
  gameDb: GameDb;
}

const parseAccountId = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toLowerCase();
};

const parseMode = (value: unknown): StealthMode => {
  const mode = String(value ?? "").toLowerCase();
  if (mode === "normal"  || mode === "off") return StealthMode.NORMAL;
  if (mode === "invisible" || mode === "on") return StealthMode.INVISIBLE;
  if (mode === "offline") return StealthMode.OFFLINE;
  throw new ValidationError("Invalid stealth mode. Use normal|invisible|offline.");
};

const parseBodyAppIds = (bodyValue: unknown): number[] => {
  if (Array.isArray(bodyValue))          return parseAppIds(bodyValue.join(","));
  if (typeof bodyValue === "string")     return parseAppIds(bodyValue);
  return [];
};

const withDefaultAppIds = (steamService: SteamService, input: number[]): number[] =>
  input.length ? input : steamService.getDefaultGameOption().appIds;

export const buildRoutes = ({ steamService, logger, config, gameDb }: RouteDependencies): Router => {
  const router = Router();

  // ── Health ────────────────────────────────────────────────────────────────
  router.get("/health", (_req, res) => {
    const statuses = steamService.getStatus();
    const boosting = statuses.filter((s) => s.status === "BOOSTING").length;
    const errors   = statuses.filter((s) => s.status === "ERROR").length;
    const { rss }  = process.memoryUsage();
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      accounts: { total: statuses.length, boosting, errors },
      memory: { rssBytes: rss },
    });
  });

  // ── Optional API token auth ────────────────────────────────────────────────
  if (config.apiToken) {
    router.use("/api", (req, res, next) => {
      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ") || auth.slice(7) !== config.apiToken) {
        res.status(401).json({ error: "Unauthorized." });
        return;
      }
      next();
    });
  }

  // ── Game options (used by frontend selectors) ─────────────────────────────
  router.get("/api/game-options", (_req, res) => {
    res.json({ gameOptions: config.gameOptions });
  });

  // ── Steam game search ─────────────────────────────────────────────────────
  router.get("/api/game-search", async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) { res.status(400).json({ error: "q is required." }); return; }
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
      await gameDb.ensureLoaded();
      const results = await gameDb.search(q, limit);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  // ── Accounts ──────────────────────────────────────────────────────────────
  router.get("/api/accounts", (_req, res) => {
    res.json({
      accounts: steamService.getAccountSummaries(),
      statuses: steamService.getStatus(),
    });
  });

  router.post("/api/accounts", async (req, res, next) => {
    try {
      const username     = String(req.body?.username      ?? "").trim();
      const password     = String(req.body?.password      ?? "").trim();
      const id           = String(req.body?.id            ?? "").trim().toLowerCase() || undefined;
      const sharedSecret = String(req.body?.sharedSecret  ?? "").trim() || undefined;
      const refreshToken = String(req.body?.refreshToken  ?? "").trim() || undefined;
      const proxy        = String(req.body?.proxy         ?? "").trim() || undefined;
      const preferredAppIds = parseBodyAppIds(req.body?.preferredAppIds);

      if (!username || !password) {
        res.status(400).json({ error: "username and password are required." });
        return;
      }

      const account = await steamService.addAccount({ id, username, password, sharedSecret, refreshToken, proxy, preferredAppIds });
      res.status(201).json({ account });
    } catch (error) {
      next(error);
    }
  });

  // ── Status ────────────────────────────────────────────────────────────────
  router.get("/api/status", (_req, res) => {
    res.json({ accounts: steamService.getStatus() });
  });

  // ── Global start / stop ───────────────────────────────────────────────────
  router.post("/api/start", async (req, res, next) => {
    try {
      const appIds = withDefaultAppIds(steamService, parseBodyAppIds(req.body?.appIds));
      const results = await steamService.startBoostForAll(appIds);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/stop", async (_req, res, next) => {
    try {
      const results = await steamService.stopBoostForAll();
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  // ── Per-account start / stop / games ─────────────────────────────────────
  router.post("/api/account/:id/start", async (req, res, next) => {
    try {
      const accountId = parseAccountId(req.params.id);
      if (!accountId) { res.status(400).json({ error: "Account ID is required." }); return; }
      const appIds = withDefaultAppIds(steamService, parseBodyAppIds(req.body?.appIds));
      const result = await steamService.startBoostForAccount(accountId, appIds);
      res.json({ result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/account/:id/stop", async (req, res, next) => {
    try {
      const accountId = parseAccountId(req.params.id);
      if (!accountId) { res.status(400).json({ error: "Account ID is required." }); return; }
      const result = await steamService.stopBoostForAccount(accountId);
      res.json({ result });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/api/account/:id", async (req, res, next) => {
    try {
      const accountId = parseAccountId(req.params.id);
      if (!accountId) { res.status(400).json({ error: "Account ID is required." }); return; }
      await steamService.removeAccount(accountId);
      res.json({ success: true, accountId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/account/:id/games", async (req, res, next) => {
    try {
      const accountId = parseAccountId(req.params.id);
      if (!accountId) { res.status(400).json({ error: "Account ID is required." }); return; }
      const appIds = parseBodyAppIds(req.body?.appIds);
      const account = await steamService.updatePreferredGames(accountId, appIds);
      res.json({ account });
    } catch (error) {
      next(error);
    }
  });

  // ── Stealth ───────────────────────────────────────────────────────────────
  router.post("/api/stealth", (req, res, next) => {
    try {
      const mode      = parseMode(req.body?.mode);
      const accountId = parseAccountId(req.body?.accountId);
      if (!accountId || accountId === "all") {
        steamService.setStealthForAll(mode);
        res.json({ success: true, scope: "all", mode });
        return;
      }
      steamService.setStealthForAccount(accountId, mode);
      res.json({ success: true, scope: accountId, mode });
    } catch (error) {
      next(error);
    }
  });

  // ── Steam Guard ───────────────────────────────────────────────────────────
  router.get("/api/guard/pending", (_req, res) => {
    res.json({ challenges: steamService.getPendingGuardChallenges() });
  });

  router.post("/api/guard/submit", (req, res, next) => {
    try {
      const accountId = parseAccountId(req.body?.accountId);
      const code      = String(req.body?.code ?? "").trim();
      if (!accountId || !code) {
        res.status(400).json({ error: "accountId and code are required." });
        return;
      }
      const accepted = steamService.submitGuardCode(accountId, code);
      if (!accepted) {
        res.status(404).json({ error: "No pending Steam Guard challenge for this account." });
        return;
      }
      res.json({ success: true, accountId });
    } catch (error) {
      next(error);
    }
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    const status  = (typeof error === "object" && error !== null && "statusCode" in error)
      ? Number((error as { statusCode: unknown }).statusCode)
      : 500;
    const safeStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
    logger.error({ err: message, status: safeStatus }, "API request failed.");
    const clientMessage = safeStatus < 500 || config.nodeEnv !== "production"
      ? message
      : "Internal server error.";
    res.status(safeStatus).json({ error: clientMessage });
  });

  return router;
};
