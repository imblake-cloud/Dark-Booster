import path from "node:path";
import dotenv from "dotenv";
import { StealthMode } from "../models/enums";

dotenv.config();

export interface GameOption {
  label: string;
  appIds: number[];
}

export interface AppConfig {
  nodeEnv: string;
  logLevel: string;
  accountsFilePath: string;
  accountsEncryptionKey?: string;
  defaultStealthMode: StealthMode;
  steamLoginIntervalMs: number;
  steamBaseReconnectDelayMs: number;
  steamMaxReconnectDelayMs: number;
  heartbeatIntervalMs: number;
  maxGamesPerAccount: number;
  gameOptions: GameOption[];
  apiEnabled: boolean;
  apiHost: string;
  apiPort: number;
  apiToken?: string;
  dashboardStaticEnabled: boolean;
  dashboardStaticDir: string;
  discordWebhookUrl?: string;
  gameDbCacheFile: string;
}

const getNumber = (key: string, fallback: number): number => {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive number.`);
  }
  return parsed;
};

const getBoolean = (key: string, fallback: boolean): boolean => {
  const value = process.env[key];
  if (!value) return fallback;
  return value.trim().toLowerCase() !== "false";
};

const parseStealthMode = (raw?: string): StealthMode => {
  switch ((raw ?? StealthMode.INVISIBLE).toLowerCase()) {
    case StealthMode.NORMAL:    return StealthMode.NORMAL;
    case StealthMode.INVISIBLE: return StealthMode.INVISIBLE;
    case StealthMode.OFFLINE:   return StealthMode.OFFLINE;
    default:
      throw new Error("DEFAULT_STEALTH_MODE must be one of: normal, invisible, offline.");
  }
};

const parseGameOptions = (raw?: string): GameOption[] => {
  const value = raw?.trim();
  if (!value) {
    return [
      { label: "CS2",            appIds: [730]    },
      { label: "Dota 2",         appIds: [570]    },
      { label: "Team Fortress 2",appIds: [440]    },
      { label: "Rust",           appIds: [252490] },
    ];
  }

  const options = value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelRaw, appIdRaw] = entry.split(":");
      const label = labelRaw?.trim();
      const appIds = (appIdRaw ?? "")
        .split("+")
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (!label || !appIds.length) {
        throw new Error(`Invalid GAME_OPTIONS entry "${entry}". Expected format "Label:730+570".`);
      }
      return { label, appIds: [...new Set(appIds)] };
    });

  if (!options.length) throw new Error("GAME_OPTIONS produced no valid game entries.");
  return options.slice(0, 25);
};

export const loadConfig = (): AppConfig => {
  const accountsPath   = process.env.ACCOUNTS_FILE_PATH?.trim()    || "./accounts.json";
  const staticDir      = process.env.DASHBOARD_STATIC_DIR?.trim()  || "./web/dist";
  const gameDbCachePath = process.env.GAME_DB_CACHE_FILE?.trim()    || "./game-db.json";

  const absoluteAccountsPath = path.isAbsolute(accountsPath)
    ? accountsPath
    : path.resolve(process.cwd(), accountsPath);

  const absoluteStaticDir = path.isAbsolute(staticDir)
    ? staticDir
    : path.resolve(process.cwd(), staticDir);

  const absoluteGameDbCachePath = path.isAbsolute(gameDbCachePath)
    ? gameDbCachePath
    : path.resolve(process.cwd(), gameDbCachePath);

  return {
    nodeEnv:                  process.env.NODE_ENV?.trim() || "development",
    logLevel:                 process.env.LOG_LEVEL?.trim() || "info",
    accountsFilePath:         absoluteAccountsPath,
    accountsEncryptionKey:    process.env.ACCOUNTS_ENCRYPTION_KEY?.trim() || undefined,
    defaultStealthMode:       parseStealthMode(process.env.DEFAULT_STEALTH_MODE),
    steamLoginIntervalMs:     getNumber("STEAM_LOGIN_INTERVAL_MS",      3000),
    steamBaseReconnectDelayMs:getNumber("STEAM_BASE_RECONNECT_DELAY_MS", 5000),
    steamMaxReconnectDelayMs: getNumber("STEAM_MAX_RECONNECT_DELAY_MS",  300000),
    heartbeatIntervalMs:      getNumber("HEARTBEAT_INTERVAL_MS",         30000),
    maxGamesPerAccount:       getNumber("MAX_GAMES_PER_ACCOUNT",         32),
    gameOptions:              parseGameOptions(process.env.GAME_OPTIONS),
    apiEnabled:               getBoolean("API_ENABLED", true),
    apiHost:                  process.env.API_HOST?.trim() || "127.0.0.1",
    apiPort:                  getNumber("API_PORT", 3100),
    apiToken:                 process.env.API_TOKEN?.trim() || undefined,
    dashboardStaticEnabled:   getBoolean("DASHBOARD_STATIC_ENABLED", true),
    dashboardStaticDir:       absoluteStaticDir,
    discordWebhookUrl:        process.env.DISCORD_WEBHOOK_URL?.trim() || undefined,
    gameDbCacheFile:          absoluteGameDbCachePath,
  };
};
