import { promises as fs } from "node:fs";
import type { Logger } from "pino";
import type {
  NewSteamAccountInput,
  PublicAccountSummary,
  SteamAccountConfig,
} from "../models/account";
import { decryptIfEncrypted } from "../utils/security";

interface RawAccountConfig {
  id?: string;
  username?: string;
  password?: string;
  shared_secret?: string;
  refresh_token?: string;
  avatar_url?: string;
  proxy?: string;
  preferred_app_ids?: number[] | string;
}

export class AccountManager {
  private readonly accounts = new Map<string, SteamAccountConfig>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly logger: Logger,
    private readonly accountsFilePath: string,
    private readonly encryptionKey?: string,
  ) {}

  async loadAccountsFromJson(): Promise<SteamAccountConfig[]> {
    const backupPath = `${this.accountsFilePath}.bak`;
    let content: string;
    try {
      content = await fs.readFile(this.accountsFilePath, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Try backup before giving up
        try {
          content = await fs.readFile(backupPath, "utf8");
          this.logger.warn({ file: backupPath }, "accounts.json not found — restored from backup.");
          await fs.writeFile(this.accountsFilePath, content, "utf8");
        } catch {
          this.logger.info({ file: this.accountsFilePath }, "accounts.json not found — creating empty file.");
          await fs.writeFile(this.accountsFilePath, "[]\n", "utf8");
          this.accounts.clear();
          return [];
        }
      } else {
        throw err;
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // JSON corrupted — attempt restore from backup
      this.logger.error({ file: this.accountsFilePath }, "accounts.json is corrupted — attempting restore from backup.");
      try {
        const backupContent = await fs.readFile(backupPath, "utf8");
        parsed = JSON.parse(backupContent);
        await fs.writeFile(this.accountsFilePath, backupContent, "utf8");
        this.logger.info({ file: backupPath }, "accounts.json restored from backup successfully.");
      } catch {
        throw new Error(
          `accounts.json is corrupted and backup restore failed. ` +
          `Fix: delete accounts.json, rename accounts.json.bak to accounts.json, and restart.`,
        );
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error("accounts.json must contain an array of account objects.");
    }

    const loaded: SteamAccountConfig[] = parsed.map((entry, index) =>
      this.validateAndNormalize(entry as RawAccountConfig, index),
    );

    this.accounts.clear();
    for (const account of loaded) {
      if (this.accounts.has(account.id)) {
        throw new Error(`Duplicate account id detected: ${account.id}`);
      }
      this.accounts.set(account.id, account);
    }

    this.logger.info(
      { count: this.accounts.size, file: this.accountsFilePath },
      "Steam accounts loaded.",
    );

    // Backup after every successful load so the backup is always recent
    void fs.copyFile(this.accountsFilePath, backupPath).catch((e: unknown) => {
      this.logger.warn({ err: e instanceof Error ? e.message : String(e) }, "Failed to write accounts backup.");
    });

    return loaded;
  }

  getAccount(accountId: string): SteamAccountConfig {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Unknown account ID: ${accountId}`);
    }
    return account;
  }

  getAllAccounts(): SteamAccountConfig[] {
    return [...this.accounts.values()];
  }

  getAccountIds(): string[] {
    return [...this.accounts.keys()];
  }

  getPublicSummaries(): PublicAccountSummary[] {
    return this.getAllAccounts().map((account) => ({
      id: account.id,
      username: account.username,
      proxy: account.proxy,
      preferredAppIds: [...account.preferredAppIds],
    }));
  }

  async addAccount(input: NewSteamAccountInput): Promise<SteamAccountConfig> {
    const normalized = this.validateAndNormalize(
      {
        id: input.id,
        username: input.username,
        password: input.password,
        shared_secret: input.sharedSecret,
        refresh_token: input.refreshToken,
        proxy: input.proxy,
        preferred_app_ids: input.preferredAppIds,
      },
      this.accounts.size,
    );

    if (this.accounts.has(normalized.id)) {
      throw new Error(`Account ID already exists: ${normalized.id}`);
    }

    this.accounts.set(normalized.id, normalized);
    await this.persistAccounts();

    this.logger.info({ accountId: normalized.id }, "Steam account added and persisted.");
    return normalized;
  }

  async removeAccount(accountId: string): Promise<void> {
    if (!this.accounts.has(accountId)) {
      throw new Error(`Unknown account ID: ${accountId}`);
    }
    this.accounts.delete(accountId);
    await this.persistAccounts();
    this.logger.info({ accountId }, "Steam account removed.");
  }

  async updatePreferredGames(accountId: string, appIds: number[]): Promise<PublicAccountSummary> {
    const account = this.getAccount(accountId);
    const normalized = this.normalizeAppIds(appIds);
    account.preferredAppIds = normalized;
    this.accounts.set(accountId, account);
    await this.persistAccounts();

    this.logger.info({ accountId, appIds: normalized }, "Updated preferred app IDs.");
    return {
      id: account.id,
      username: account.username,
      proxy: account.proxy,
      preferredAppIds: [...account.preferredAppIds],
    };
  }

  async updateRefreshToken(accountId: string, refreshToken?: string): Promise<void> {
    const account = this.getAccount(accountId);
    const normalized = refreshToken?.trim() || undefined;
    if (account.refreshToken === normalized) {
      return;
    }

    account.refreshToken = normalized;
    this.accounts.set(accountId, account);
    await this.persistAccounts();
    this.logger.info({ accountId, hasRefreshToken: Boolean(normalized) }, "Refresh token updated.");
  }

  async updateAvatarUrl(accountId: string, avatarUrl: string): Promise<void> {
    const account = this.getAccount(accountId);
    if (account.avatarUrl === avatarUrl) return;
    account.avatarUrl = avatarUrl;
    this.accounts.set(accountId, account);
    await this.persistAccounts();
    this.logger.info({ accountId }, "Avatar URL updated.");
  }

  private async persistAccounts(): Promise<void> {
    const payload = this.getAllAccounts().map((account) => ({
      id: account.id,
      username: account.username,
      password: account.password,
      ...(account.sharedSecret ? { shared_secret: account.sharedSecret } : {}),
      ...(account.refreshToken ? { refresh_token: account.refreshToken } : {}),
      ...(account.avatarUrl ? { avatar_url: account.avatarUrl } : {}),
      ...(account.proxy ? { proxy: account.proxy } : {}),
      preferred_app_ids: account.preferredAppIds,
    }));

    this.writeChain = this.writeChain.then(async () => {
      const content = JSON.stringify(payload, null, 2);
      const tmpPath = `${this.accountsFilePath}.tmp`;
      await fs.writeFile(tmpPath, `${content}\n`, "utf8");
      await fs.rename(tmpPath, this.accountsFilePath);
    });
    await this.writeChain;
  }

  private validateAndNormalize(
    raw: RawAccountConfig,
    index: number,
  ): SteamAccountConfig {
    const username = raw.username?.trim();
    const id = (raw.id?.trim() || username || `account-${index + 1}`).toLowerCase();

    if (!username) {
      throw new Error(`Account at index ${index} is missing "username".`);
    }

    if (!raw.password?.trim()) {
      throw new Error(`Account "${id}" is missing "password".`);
    }

    const password = decryptIfEncrypted(raw.password.trim(), this.encryptionKey);
    const sharedSecret = raw.shared_secret?.trim()
      ? decryptIfEncrypted(raw.shared_secret.trim(), this.encryptionKey)
      : undefined;
    const refreshToken = raw.refresh_token?.trim()
      ? decryptIfEncrypted(raw.refresh_token.trim(), this.encryptionKey)
      : undefined;

    return {
      id,
      username,
      password,
      sharedSecret,
      refreshToken,
      avatarUrl: raw.avatar_url?.trim() || undefined,
      proxy: raw.proxy?.trim() || undefined,
      preferredAppIds: this.normalizeAppIds(raw.preferred_app_ids),
    };
  }

  private normalizeAppIds(raw: unknown): number[] {
    if (Array.isArray(raw)) {
      return [...new Set(raw.filter((id) => Number.isInteger(id) && id > 0))];
    }

    if (typeof raw === "string") {
      return [...new Set(
        raw
          .split(/[,\s+]+/)
          .map((segment) => Number(segment.trim()))
          .filter((id) => Number.isInteger(id) && id > 0),
      )];
    }

    return [];
  }
}
