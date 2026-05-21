import type { Logger } from "pino";
import type { AppConfig, GameOption } from "../config/config";
import { AccountManager } from "../core/accountManager";
import { BoosterService } from "../core/boosterService";
import { SteamManager } from "../core/steamManager";
import type {
  AccountSnapshot,
  ActionResult,
  NewSteamAccountInput,
  PendingGuardChallenge,
  PublicAccountSummary,
  SteamAccountConfig,
} from "../models/account";
import { StealthMode } from "../models/enums";

export class SteamService {
  private initialized = false;

  constructor(
    private readonly logger: Logger,
    private readonly config: AppConfig,
    private readonly accountManager: AccountManager,
    private readonly steamManager: SteamManager,
    private readonly boosterService: BoosterService,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const accounts: SteamAccountConfig[] = await this.accountManager.loadAccountsFromJson();
    this.steamManager.initializeAccounts(accounts);

    if (accounts.length) {
      await this.steamManager.connectAll();
      this.logger.info({ count: accounts.length }, "Steam service initialized.");
    } else {
      this.logger.info("No Steam accounts loaded. Add accounts via the dashboard.");
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.steamManager.shutdown();
  }

  async startBoostForAccount(accountId: string, appIds: number[]): Promise<ActionResult> {
    return this.boosterService.startBoost(accountId, appIds);
  }

  async stopBoostForAccount(accountId: string): Promise<ActionResult> {
    return this.boosterService.stopBoost(accountId);
  }

  async startBoostForAll(appIds: number[]): Promise<ActionResult[]> {
    return this.boosterService.startAll(appIds);
  }

  async stopBoostForAll(): Promise<ActionResult[]> {
    return this.boosterService.stopAll();
  }

  setStealthForAccount(accountId: string, mode: StealthMode): void {
    this.boosterService.setStealthForAccount(accountId, mode);
  }

  setStealthForAll(mode: StealthMode): void {
    this.boosterService.setStealthForAll(mode);
  }

  async connectAccount(accountId: string): Promise<void> {
    await this.steamManager.connectAccount(accountId);
  }

  async disconnectAccount(accountId: string): Promise<void> {
    await this.steamManager.disconnectAccount(accountId);
  }

  getStatus(): AccountSnapshot[] {
    return this.boosterService.getStatus();
  }

  getAccountSummaries(): PublicAccountSummary[] {
    return this.accountManager.getPublicSummaries();
  }

  getGameOptions(): GameOption[] {
    return this.config.gameOptions;
  }

  getDefaultGameOption(): GameOption {
    return this.config.gameOptions[0] ?? { label: "CS2", appIds: [730] };
  }

  async addAccount(input: NewSteamAccountInput): Promise<PublicAccountSummary> {
    const account = await this.accountManager.addAccount(input);
    this.steamManager.addAccount(account);

    return {
      id: account.id,
      username: account.username,
      proxy: account.proxy,
      preferredAppIds: [...account.preferredAppIds],
    };
  }

  async removeAccount(accountId: string): Promise<void> {
    await this.steamManager.removeAccount(accountId);
    await this.accountManager.removeAccount(accountId);
  }

  async updatePreferredGames(accountId: string, appIds: number[]): Promise<PublicAccountSummary> {
    return this.accountManager.updatePreferredGames(accountId, appIds);
  }

  async updateRefreshToken(accountId: string, refreshToken?: string): Promise<void> {
    await this.accountManager.updateRefreshToken(accountId, refreshToken);
  }

  getPendingGuardChallenges(): PendingGuardChallenge[] {
    return this.steamManager.getPendingGuardChallenges();
  }

  submitGuardCode(accountId: string, code: string): boolean {
    return this.steamManager.submitGuardCode(accountId, code);
  }
}
