import fs from "node:fs";
import { loadConfig } from "./config/config";
import { createLogger } from "./utils/logger";
import { AccountManager } from "./core/accountManager";
import { SteamManager } from "./core/steamManager";
import { BoosterService } from "./core/boosterService";
import { SteamService } from "./services/steamService";
import { AlertService } from "./services/alertService";
import { GameDb } from "./services/gameDb";
import { WsServer } from "./api/wsServer";
import { ApiServer } from "./api/server";

const bootstrap = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const accountManager = new AccountManager(
    logger,
    config.accountsFilePath,
    config.accountsEncryptionKey,
  );

  const steamManager = new SteamManager(logger, {
    loginIntervalMs:       config.steamLoginIntervalMs,
    baseReconnectDelayMs:  config.steamBaseReconnectDelayMs,
    maxReconnectDelayMs:   config.steamMaxReconnectDelayMs,
    heartbeatIntervalMs:   config.heartbeatIntervalMs,
    defaultStealthMode:    config.defaultStealthMode,
    maxGamesPerAccount:    config.maxGamesPerAccount,
  }, {
    onRefreshToken: async (accountId, refreshToken) => {
      await accountManager.updateRefreshToken(accountId, refreshToken);
    },
    onAvatarUrl: async (accountId, avatarUrl) => {
      await accountManager.updateAvatarUrl(accountId, avatarUrl);
    },
  });

  const boosterService = new BoosterService(logger, accountManager, steamManager);
  const steamService   = new SteamService(logger, config, accountManager, steamManager, boosterService);
  new AlertService(logger, steamManager, config.discordWebhookUrl);
  const gameDb         = new GameDb(logger, config.gameDbCacheFile);
  const wsServer       = new WsServer(logger, steamManager);
  const apiServer      = new ApiServer(logger, config, steamService, wsServer, gameDb);

  // warm up game DB in background so first search is fast
  void gameDb.ensureLoaded();

  // Guard against Docker creating a directory instead of a file for the volume mount
  const jsonPath = config.accountsFilePath;
  if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).isDirectory()) {
    logger.error(
      { path: jsonPath },
      "accounts.json is a DIRECTORY (Docker created it as a dir mount). " +
      "Fix: rm -rf accounts.json && echo '[]' > accounts.json, then restart.",
    );
    process.exit(1);
  }

  await steamService.initialize();
  apiServer.start();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received.");
    try {
      await apiServer.stop();
      await steamService.shutdown();
      logger.info("Shutdown complete.");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, "Shutdown failed.");
      process.exit(1);
    }
  };

  process.on("SIGINT",  () => { void shutdown("SIGINT");  });
  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
};

void bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", error);
  process.exit(1);
});
