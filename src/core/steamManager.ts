import { EventEmitter } from "node:events";
import SteamUser from "steam-user";
import SteamTotp from "steam-totp";
import {
  EAuthSessionGuardType,
  EAuthTokenPlatformType,
  LoginSession,
} from "steam-session";
import type { Logger } from "pino";
import type {
  AccountRuntimeState,
  AccountSnapshot,
  PendingGuardChallenge,
  SteamAccountConfig,
} from "../models/account";
import { AccountStatus, StealthMode } from "../models/enums";
import { sanitizeErrorMessage } from "../utils/security";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors";

const PERSONA_OFFLINE = 0;
const PERSONA_ONLINE = 1;
const PERSONA_INVISIBLE = 7;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const jitter = (base: number, fraction = 0.2): number =>
  Math.round(base * (1 + (Math.random() * 2 - 1) * fraction));

const MAX_SAFE_GAMES = 10;

export interface SteamManagerSettings {
  loginIntervalMs: number;
  baseReconnectDelayMs: number;
  maxReconnectDelayMs: number;
  heartbeatIntervalMs: number;
  defaultStealthMode: StealthMode;
  maxGamesPerAccount: number;
}

type SteamClient = InstanceType<typeof SteamUser>;

type SteamLogOnDetails = {
  accountName?: string;
  password?: string;
  twoFactorCode?: string;
  refreshToken?: string;
};

export interface SteamManagerHooks {
  onRefreshToken?: (accountId: string, refreshToken?: string) => Promise<void> | void;
  onAvatarUrl?: (accountId: string, avatarUrl: string) => Promise<void> | void;
}

interface PendingGuardEntry {
  challenge: PendingGuardChallenge;
  callback?: (code: string) => Promise<void> | void;
  clearOnSubmit?: boolean;
}

type SteamManagerEventMap = {
  state_change: [];
  guards_change: [];
};

export class SteamManager extends EventEmitter<SteamManagerEventMap> {
  private readonly accounts = new Map<string, SteamAccountConfig>();
  private readonly states = new Map<string, AccountRuntimeState>();
  private readonly clients = new Map<string, SteamClient>();
  private readonly loginQueue: string[] = [];
  private readonly queuedLogins = new Set<string>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly intentionallyOffline = new Set<string>();
  private readonly pendingGuards = new Map<string, PendingGuardEntry>();

  private processingQueue = false;
  private shuttingDown = false;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly logger: Logger,
    private readonly settings: SteamManagerSettings,
    private readonly hooks: SteamManagerHooks = {},
  ) {
    super();
  }

  initializeAccounts(accounts: SteamAccountConfig[]): void {
    this.accounts.clear();
    this.states.clear();

    for (const account of accounts) {
      this.accounts.set(account.id, account);
      this.states.set(account.id, {
        status: AccountStatus.OFFLINE,
        retryCount: 0,
        boostingAppIds: [],
        stealthMode: this.settings.defaultStealthMode,
        updatedAt: new Date(),
      });
    }

    this.startHeartbeat();
  }

  addAccount(account: SteamAccountConfig): void {
    if (this.accounts.has(account.id)) {
      throw new ConflictError(`Account ID already exists: ${account.id}`);
    }

    this.accounts.set(account.id, account);
    this.states.set(account.id, {
      status: AccountStatus.OFFLINE,
      retryCount: 0,
      boostingAppIds: [],
      stealthMode: this.settings.defaultStealthMode,
      updatedAt: new Date(),
    });
    this.enqueueLogin(account.id);
  }

  async removeAccount(accountId: string): Promise<void> {
    this.requireAccount(accountId);
    this.intentionallyOffline.add(accountId);
    this.clearReconnectTimer(accountId);
    this.clearPendingGuard(accountId);

    const client = this.clients.get(accountId);
    if (client) {
      try { client.gamesPlayed([]); } catch { /* ignored */ }
      try { client.logOff(); } catch { /* ignored */ }
      this.clients.delete(accountId);
    }

    this.accounts.delete(accountId);
    this.states.delete(accountId);
    this.intentionallyOffline.delete(accountId);
    this.emit("state_change");
    this.logger.info({ accountId }, "Account removed from Steam manager.");
  }

  async connectAll(): Promise<void> {
    for (const accountId of this.accounts.keys()) {
      this.enqueueLogin(accountId);
    }
  }

  async connectAccount(accountId: string): Promise<void> {
    this.requireAccount(accountId);
    this.intentionallyOffline.delete(accountId);
    this.enqueueLogin(accountId);
  }

  async disconnectAccount(accountId: string): Promise<void> {
    this.requireAccount(accountId);
    this.intentionallyOffline.add(accountId);
    this.clearReconnectTimer(accountId);
    this.clearPendingGuard(accountId);

    const client = this.clients.get(accountId);
    if (client) {
      try {
        client.gamesPlayed([]);
      } catch {
        // ignored
      }
      try {
        client.logOff();
      } catch {
        // ignored
      }
    }

    this.updateState(accountId, {
      status: AccountStatus.OFFLINE,
      boostingAppIds: [],
      lastError: undefined,
    });
  }

  async startBoost(accountId: string, appIds: number[]): Promise<void> {
    if (!appIds.length) {
      throw new ValidationError("At least one app ID is required.");
    }

    const max = this.settings.maxGamesPerAccount;
    if (appIds.length > max) {
      throw new ValidationError(`Too many app IDs: ${appIds.length} requested, maximum is ${max}.`);
    }
    if (appIds.length > MAX_SAFE_GAMES) {
      this.logger.warn(
        { accountId, count: appIds.length },
        `Boosting ${appIds.length} games simultaneously — Steam detects > ${MAX_SAFE_GAMES} as suspicious.`,
      );
    }

    this.requireAccount(accountId);
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error(`Steam client not initialized for account ${accountId}.`);
    }

    const state = this.requireState(accountId);
    if (
      state.status !== AccountStatus.ONLINE &&
      state.status !== AccountStatus.BOOSTING
    ) {
      throw new ConflictError(
        `Account ${accountId} is ${state.status}. Connect account before boosting.`,
      );
    }

    const customStatusStr = "";
    client.gamesPlayed([customStatusStr, ...appIds]);
    this.updateState(accountId, {
      status: AccountStatus.BOOSTING,
      boostingAppIds: [...appIds],
      lastError: undefined,
    });
    this.applyPersona(accountId);

    this.logger.info({ accountId, appIds }, "Boost started.");
  }

  async stopBoost(accountId: string): Promise<void> {
    this.requireAccount(accountId);
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error(`Steam client not initialized for account ${accountId}.`);
    }

    client.gamesPlayed([]);

    const stillConnected = this.isClientConnected(client);
    this.updateState(accountId, {
      status: stillConnected ? AccountStatus.ONLINE : AccountStatus.OFFLINE,
      boostingAppIds: [],
      lastError: undefined,
    });

    this.logger.info({ accountId }, "Boost stopped.");
  }

  setStealthMode(accountId: string, mode: StealthMode): void {
    this.requireAccount(accountId);
    this.updateState(accountId, { stealthMode: mode });
    this.applyPersona(accountId);
  }

  setStealthModeAll(mode: StealthMode): void {
    for (const accountId of this.accounts.keys()) {
      this.setStealthMode(accountId, mode);
    }
  }

  getPendingGuardChallenges(): PendingGuardChallenge[] {
    return [...this.pendingGuards.values()]
      .map((entry) => entry.challenge)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  submitGuardCode(accountId: string, code: string): boolean {
    const pending = this.pendingGuards.get(accountId);
    if (!pending) {
      return false;
    }

    if (!pending.challenge.requiresCode || !pending.callback) {
      throw new ValidationError("This pending login must be approved in Steam Mobile and does not accept a code.");
    }

    const sanitized = code.trim();
    if (!sanitized) {
      throw new ValidationError("Steam Guard code cannot be empty.");
    }

    const maybePromise = pending.callback(sanitized);
    if (maybePromise && typeof (maybePromise as Promise<void>).catch === "function") {
      void (maybePromise as Promise<void>).catch((error: unknown) => {
        const message = sanitizeErrorMessage(error);
        this.logger.warn({ accountId, error: message }, "Steam Guard code submission failed.");
      });
    }
    if (pending.clearOnSubmit) {
      this.pendingGuards.delete(accountId);
    }
    this.updateState(accountId, { lastError: undefined, status: AccountStatus.CONNECTING });
    this.logger.info({ accountId }, "Steam Guard code submitted.");
    return true;
  }

  getSnapshot(accountId: string): AccountSnapshot {
    const account = this.requireAccount(accountId);
    const state = this.requireState(accountId);
    return {
      id: account.id,
      username: account.username,
      proxy: account.proxy,
      avatarUrl: account.avatarUrl,
      status: state.status,
      retryCount: state.retryCount,
      lastError: state.lastError,
      boostingAppIds: [...state.boostingAppIds],
      stealthMode: state.stealthMode,
      connectedAt: state.connectedAt?.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  getAllSnapshots(): AccountSnapshot[] {
    return [...this.accounts.keys()]
      .map((accountId) => this.getSnapshot(accountId))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const [accountId, client] of this.clients.entries()) {
      try {
        client.gamesPlayed([]);
      } catch {
        // ignored
      }
      try {
        client.logOff();
      } catch {
        // ignored
      }

      this.updateState(accountId, {
        status: AccountStatus.OFFLINE,
        boostingAppIds: [],
      });
      this.clearPendingGuard(accountId);
    }
  }

  private enqueueLogin(accountId: string): void {
    if (this.shuttingDown || this.intentionallyOffline.has(accountId)) {
      return;
    }

    if (this.queuedLogins.has(accountId)) {
      return;
    }

    this.queuedLogins.add(accountId);
    this.loginQueue.push(accountId);
    void this.processLoginQueue();
  }

  private async processLoginQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    while (this.loginQueue.length > 0 && !this.shuttingDown) {
      const accountId = this.loginQueue.shift();
      if (!accountId) {
        continue;
      }
      this.queuedLogins.delete(accountId);

      try {
        await this.performLogin(accountId);
      } catch (error) {
        const message = sanitizeErrorMessage(error);
        this.logger.error({ accountId, err: message }, "Steam login failed.");
        this.scheduleReconnect(accountId, message);
      }

      await delay(jitter(this.settings.loginIntervalMs));
    }

    this.processingQueue = false;
  }

  private async performLogin(accountId: string): Promise<void> {
    const account = this.requireAccount(accountId);
    const state = this.requireState(accountId);
    if (state.status === AccountStatus.CONNECTING || this.intentionallyOffline.has(accountId)) {
      return;
    }

    const client = this.getOrCreateClient(account);
    if (this.isClientConnected(client)) {
      this.updateState(accountId, {
        status: state.boostingAppIds.length ? AccountStatus.BOOSTING : AccountStatus.ONLINE,
        lastError: undefined,
      });
      this.applyPersona(accountId);
      return;
    }

    this.updateState(accountId, { status: AccountStatus.CONNECTING, lastError: undefined });

    this.logger.info({ accountId }, "Attempting Steam login.");

    if (account.refreshToken) {
      try {
        await this.logOnClient(client, { refreshToken: account.refreshToken });
        this.finalizeSuccessfulLogin(accountId, client);
        return;
      } catch (error) {
        const message = sanitizeErrorMessage(error);
        this.logger.warn(
          { accountId, error: message },
          "Refresh token login failed. Falling back to credential flow.",
        );
        if (this.shouldInvalidateRefreshToken(message)) {
          await this.persistRefreshToken(accountId, undefined);
        }
      }
    }

    if (account.sharedSecret) {
      const logOnDetails: SteamLogOnDetails = {
        accountName: account.username,
        password: account.password,
        twoFactorCode: SteamTotp.generateAuthCode(account.sharedSecret),
      };
      await this.logOnClient(client, logOnDetails);
      this.finalizeSuccessfulLogin(accountId, client);
      return;
    }

    const refreshToken = await this.authenticateWithSteamSession(accountId, account);
    await this.persistRefreshToken(accountId, refreshToken);
    await this.logOnClient(client, { refreshToken });
    this.finalizeSuccessfulLogin(accountId, client);
  }

  private async logOnClient(client: SteamClient, details: SteamLogOnDetails): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error("Steam login timed out after 180 seconds."));
      }, 180_000);

      const onLoggedOn = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const onError = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.off("loggedOn", onLoggedOn);
        client.off("error", onError);
      };

      client.on("loggedOn", onLoggedOn);
      client.on("error", onError);
      client.logOn(details as never);
    });
  }

  private finalizeSuccessfulLogin(accountId: string, client: SteamClient): void {
    const account = this.requireAccount(accountId);
    const state = this.requireState(accountId);
    this.clearReconnectTimer(accountId);
    this.clearPendingGuard(accountId);

    const resumeIds = state.boostingAppIds.length
      ? state.boostingAppIds
      : account.preferredAppIds;

    if (resumeIds.length && !state.boostingAppIds.length) {
      this.logger.info({ accountId, appIds: resumeIds }, "Auto-resuming boost from preferredAppIds.");
    }

    this.updateState(accountId, {
      status: resumeIds.length ? AccountStatus.BOOSTING : AccountStatus.ONLINE,
      boostingAppIds: resumeIds,
      connectedAt: new Date(),
      retryCount: 0,
      lastError: undefined,
    });

    if (resumeIds.length) {
      client.gamesPlayed(["", ...resumeIds]);
    }
    this.applyPersona(accountId);
  }

  private shouldInvalidateRefreshToken(message: string): boolean {
    const lowered = message.toLowerCase();
    return (
      lowered.includes("invalid") ||
      lowered.includes("denied") ||
      lowered.includes("expired") ||
      lowered.includes("revoked") ||
      lowered.includes("token")
    );
  }

  private async persistRefreshToken(accountId: string, refreshToken?: string): Promise<void> {
    const account = this.requireAccount(accountId);
    const normalized = refreshToken?.trim() || undefined;
    if (account.refreshToken === normalized) {
      return;
    }

    account.refreshToken = normalized;
    this.accounts.set(accountId, account);

    if (!this.hooks.onRefreshToken) {
      return;
    }

    try {
      await this.hooks.onRefreshToken(accountId, normalized);
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      this.logger.warn({ accountId, error: message }, "Failed to persist refresh token.");
    }
  }

  private async persistAvatarUrl(accountId: string, avatarUrl: string): Promise<void> {
    const account = this.requireAccount(accountId);
    if (account.avatarUrl === avatarUrl) return;
    account.avatarUrl = avatarUrl;
    this.accounts.set(accountId, account);
    this.emit("state_change");
    if (!this.hooks.onAvatarUrl) return;
    try {
      await this.hooks.onAvatarUrl(accountId, avatarUrl);
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      this.logger.warn({ accountId, error: message }, "Failed to persist avatar URL.");
    }
  }

  private async authenticateWithSteamSession(
    accountId: string,
    account: SteamAccountConfig,
  ): Promise<string> {
    const session = new LoginSession(EAuthTokenPlatformType.SteamClient, {
      ...(account.proxy ? { httpProxy: account.proxy } : {}),
    });

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const rejectLogin = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        // Keep the modal visible with a status message instead of closing it abruptly.
        // The entry will be replaced when the next login attempt registers a new challenge,
        // or cleared by finalizeSuccessfulLogin if login succeeds via refresh token.
        this.updatePendingChallenge(accountId, {
          requiresCode: false,
          canApprove: false,
          message: "Steam ended the session. Dark Booster will retry automatically — please wait.",
        });
        cleanupListeners();
        reject(error);
      };

      const cleanupListeners = () => {
        session.removeAllListeners("authenticated");
        session.removeAllListeners("timeout");
        session.removeAllListeners("error");
      };

      session.on("authenticated", () => {
        if (!session.refreshToken) {
          rejectLogin(new Error("Steam approval completed but no refresh token was returned."));
          return;
        }
        this.logger.info({ accountId }, "Steam session authenticated via approve/code flow.");
        settled = true;
        this.clearPendingGuard(accountId);
        cleanupListeners();
        resolve(session.refreshToken);
      });

      session.on("timeout", () => {
        rejectLogin(new Error("Steam session timed out."));
      });

      session.on("error", (error) => {
        rejectLogin(error);
      });

      void (async () => {
        const response = await session.startWithCredentials({
          accountName: account.username,
          password: account.password,
        });

        if (!response.actionRequired) {
          this.updateState(accountId, {
            status: AccountStatus.CONNECTING,
            lastError: "Waiting for Steam authentication to finish.",
          });
          return;
        }

        this.registerSteamSessionChallenge(accountId, account.username, session, response.validActions);
      })().catch((error) => {
        rejectLogin(error);
      });
    });
  }

  private registerSteamSessionChallenge(
    accountId: string,
    username: string,
    session: LoginSession,
    rawActions?: Array<{ type: number; detail?: string }>,
  ): void {
    const actions = rawActions ?? [];
    // Mobile approval (DeviceConfirmation) is intentionally disabled — it triggers
    // Steam's suspicious-login security checks and causes blocked logins. Code-only auth is used instead.
    const hasApprove = false;
    const hasCode = actions.some(
      (action) =>
        action.type === EAuthSessionGuardType.DeviceCode ||
        action.type === EAuthSessionGuardType.EmailCode,
    );

    const emailDomain = actions.find((action) => action.type === EAuthSessionGuardType.EmailCode)
      ?.detail;

    const challengeType: PendingGuardChallenge["type"] = "code";

    const message = emailDomain
      ? `Enter the Steam Guard code sent to your email (${emailDomain}).`
      : "Enter your Steam Guard code from the Steam Mobile Authenticator app.";

    const challenge: PendingGuardChallenge = {
      challengeId: `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accountId,
      username,
      type: challengeType,
      canApprove: hasApprove,
      requiresCode: hasCode,
      message,
      domain: emailDomain ?? undefined,
      lastCodeWrong: false,
      requestedAt: new Date().toISOString(),
    };

    const entry: PendingGuardEntry = {
      challenge,
      clearOnSubmit: false,
    };

    if (hasCode) {
      entry.callback = async (code: string) => {
        try {
          await session.submitSteamGuardCode(code);
          this.updatePendingChallenge(accountId, {
            lastCodeWrong: false,
            requestedAt: new Date().toISOString(),
          });
          this.updateState(accountId, {
            status: AccountStatus.CONNECTING,
            lastError: hasApprove
              ? "Code submitted. Waiting for Steam to complete login."
              : "Code submitted. Waiting for Steam authentication.",
          });
        } catch (error) {
          const message = sanitizeErrorMessage(error);
          this.updatePendingChallenge(accountId, {
            lastCodeWrong: true,
            requestedAt: new Date().toISOString(),
          }, true);
          this.updateState(accountId, {
            status: AccountStatus.CONNECTING,
            lastError: `Steam Guard code invalid: ${message}`,
          });
          throw error;
        }
      };
    }

    this.pendingGuards.set(accountId, entry);
    this.emit("guards_change");
    this.updateState(accountId, { status: AccountStatus.CONNECTING, lastError: challenge.message });

    this.logger.warn(
      {
        accountId,
        challengeType: challenge.type,
        canApprove: challenge.canApprove,
        requiresCode: challenge.requiresCode,
      },
      "Steam Guard challenge pending via steam-session.",
    );
  }

  private getOrCreateClient(account: SteamAccountConfig): SteamClient {
    const existing = this.clients.get(account.id);
    if (existing) {
      return existing;
    }

    const clientOptions: Record<string, unknown> = { autoRelogin: false };
    if (account.proxy) {
      clientOptions.httpProxy = account.proxy;
    }

    const client = new SteamUser(clientOptions);
    this.attachClientEvents(account.id, client);
    this.clients.set(account.id, client);
    return client;
  }

  private attachClientEvents(accountId: string, client: SteamClient): void {
    client.on("loggedOn", () => {
      const state = this.requireState(accountId);
      const nextStatus = state.boostingAppIds.length
        ? AccountStatus.BOOSTING
        : AccountStatus.ONLINE;

      this.updateState(accountId, {
        status: nextStatus,
        connectedAt: state.connectedAt ?? new Date(),
        lastError: undefined,
      });
      this.applyPersona(accountId);
      this.logger.info({ accountId }, "Steam logged in.");
    });

    client.on("disconnected", (_result: number, message?: string) => {
      if (this.shuttingDown || this.intentionallyOffline.has(accountId)) {
        return;
      }
      this.logger.warn({ accountId, message }, "Steam disconnected.");
      this.clearPendingGuard(accountId);
      this.scheduleReconnect(accountId, message || "Disconnected from Steam.");
    });

    client.on("steamGuard", (domain, callback, lastCodeWrong) => {
      const account = this.requireAccount(accountId);

      if (account.sharedSecret && !lastCodeWrong) {
        const generated = SteamTotp.generateAuthCode(account.sharedSecret);
        callback(generated);
        this.logger.info({ accountId }, "Steam Guard code generated from shared secret.");
        return;
      }

      const challenge: PendingGuardChallenge = {
        challengeId: `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        accountId,
        username: account.username,
        type: "code",
        canApprove: false,
        requiresCode: true,
        message: "Steam Guard code required.",
        domain: domain ?? undefined,
        lastCodeWrong: Boolean(lastCodeWrong),
        requestedAt: new Date().toISOString(),
      };

      this.pendingGuards.set(accountId, { challenge, callback, clearOnSubmit: true });
      this.emit("guards_change");
      this.updateState(accountId, {
        status: AccountStatus.CONNECTING,
        lastError: lastCodeWrong
          ? "Steam Guard code was incorrect. New code required."
          : "Steam Guard code required.",
      });

      this.logger.warn(
        { accountId, domain: domain ?? null, lastCodeWrong: Boolean(lastCodeWrong) },
        "Steam Guard challenge pending.",
      );
    });

    client.on("refreshToken", (refreshToken: string) => {
      void this.persistRefreshToken(accountId, refreshToken);
      this.logger.info({ accountId }, "Steam refresh token rotated.");
    });

    client.on("user", (steamId: unknown, persona: Record<string, unknown>) => {
      const ownId = client.steamID;
      if (!ownId) return;
      const eventId = (steamId as { getSteamID64?: () => string }).getSteamID64?.();
      if (!eventId || eventId !== ownId.getSteamID64()) return;
      const avatarUrl = typeof persona["avatar_url_full"] === "string" ? persona["avatar_url_full"] : undefined;
      if (avatarUrl) void this.persistAvatarUrl(accountId, avatarUrl);
    });

    client.on("error", (error: unknown) => {
      if (this.shuttingDown || this.intentionallyOffline.has(accountId)) {
        return;
      }

      const err = sanitizeErrorMessage(error);
      this.logger.error({ accountId, err }, "Steam client error.");
      this.clearPendingGuard(accountId);
      this.scheduleReconnect(accountId, err);
    });
  }

  private scheduleReconnect(accountId: string, reason: string): void {
    if (this.shuttingDown || this.intentionallyOffline.has(accountId)) {
      return;
    }

    const state = this.requireState(accountId);
    const nextRetry = state.retryCount + 1;
    const delayMs = jitter(Math.min(
      this.settings.baseReconnectDelayMs * 2 ** Math.max(0, nextRetry - 1),
      this.settings.maxReconnectDelayMs,
    ));

    this.updateState(accountId, {
      status: AccountStatus.ERROR,
      retryCount: nextRetry,
      lastError: reason,
    });
    this.clearPendingGuard(accountId);

    this.clearReconnectTimer(accountId);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(accountId);
      this.enqueueLogin(accountId);
    }, delayMs);

    this.reconnectTimers.set(accountId, timer);
    this.logger.warn(
      { accountId, delayMs, retryCount: nextRetry, reason },
      "Scheduled reconnect.",
    );
  }

  private clearReconnectTimer(accountId: string): void {
    const timer = this.reconnectTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(accountId);
    }
  }

  private clearPendingGuard(accountId: string): void {
    if (this.pendingGuards.has(accountId)) {
      this.pendingGuards.delete(accountId);
      this.emit("guards_change");
    }
  }

  private updatePendingChallenge(
    accountId: string,
    patch: Partial<Omit<PendingGuardChallenge, "challengeId" | "accountId" | "username">>,
    refreshId = false,
  ): void {
    const pending = this.pendingGuards.get(accountId);
    if (!pending) {
      return;
    }

    pending.challenge = {
      ...pending.challenge,
      ...patch,
      // New challengeId forces the frontend to un-dismiss the modal (e.g. wrong code retry)
      ...(refreshId ? { challengeId: `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } : {}),
    };
    this.pendingGuards.set(accountId, pending);
    this.emit("guards_change");
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.shuttingDown) {
        return;
      }

      for (const [accountId, state] of this.states.entries()) {
        if (this.intentionallyOffline.has(accountId)) {
          continue;
        }

        const client = this.clients.get(accountId);
        const connected = client ? this.isClientConnected(client) : false;
        if (!connected && state.status !== AccountStatus.CONNECTING) {
          if (!this.reconnectTimers.has(accountId)) {
            this.scheduleReconnect(accountId, "Heartbeat detected disconnected session.");
          }
          continue;
        }

        if (connected && state.status === AccountStatus.ERROR) {
          this.updateState(accountId, {
            status: state.boostingAppIds.length
              ? AccountStatus.BOOSTING
              : AccountStatus.ONLINE,
            lastError: undefined,
          });
        }
      }
    }, this.settings.heartbeatIntervalMs);
  }

  private applyPersona(accountId: string): void {
    const state = this.requireState(accountId);
    const client = this.clients.get(accountId);
    if (!client || !this.isClientConnected(client)) {
      return;
    }

    const persona = this.modeToPersona(state.stealthMode);
    try {
      client.setPersona(persona);
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      this.logger.warn({ accountId, message }, "Failed to set Steam persona.");
    }
  }

  private modeToPersona(mode: StealthMode): number {
    switch (mode) {
      case StealthMode.OFFLINE:
        return PERSONA_OFFLINE;
      case StealthMode.INVISIBLE:
        return PERSONA_INVISIBLE;
      case StealthMode.NORMAL:
      default:
        return PERSONA_ONLINE;
    }
  }

  private isClientConnected(client: SteamClient): boolean {
    return Boolean(client.steamID);
  }

  private updateState(
    accountId: string,
    patch: Partial<Omit<AccountRuntimeState, "updatedAt">>,
  ): void {
    const state = this.requireState(accountId);
    const nextState: AccountRuntimeState = {
      ...state,
      ...patch,
      updatedAt: new Date(),
    };
    this.states.set(accountId, nextState);
    this.emit("state_change");
  }

  private requireAccount(accountId: string): SteamAccountConfig {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new NotFoundError(`Unknown account ID: ${accountId}`);
    }
    return account;
  }

  private requireState(accountId: string): AccountRuntimeState {
    const state = this.states.get(accountId);
    if (!state) {
      throw new Error(`No runtime state for account ID: ${accountId}`);
    }
    return state;
  }
}
