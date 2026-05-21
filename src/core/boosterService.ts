import type { Logger } from "pino";
import { AccountManager } from "./accountManager";
import { SteamManager } from "./steamManager";
import type { AccountSnapshot, ActionResult } from "../models/account";
import { StealthMode } from "../models/enums";

export class BoosterService {
  constructor(
    private readonly logger: Logger,
    private readonly accountManager: AccountManager,
    private readonly steamManager: SteamManager,
  ) {}

  async startBoost(accountId: string, appIds: number[]): Promise<ActionResult> {
    await this.steamManager.startBoost(accountId, appIds);
    return {
      accountId,
      success: true,
      message: `Boosting started for app IDs: ${appIds.join(", ")}`,
    };
  }

  async stopBoost(accountId: string): Promise<ActionResult> {
    await this.steamManager.stopBoost(accountId);
    return {
      accountId,
      success: true,
      message: "Boosting stopped.",
    };
  }

  async startAll(appIds: number[]): Promise<ActionResult[]> {
    const accountIds = this.accountManager.getAccountIds();
    const results = await Promise.allSettled(
      accountIds.map((accountId) => this.steamManager.startBoost(accountId, appIds)),
    );

    return results.map((result, index) => {
      const accountId = accountIds[index] ?? "unknown";
      if (result.status === "fulfilled") {
        return {
          accountId,
          success: true,
          message: `Boosting started for app IDs: ${appIds.join(", ")}`,
        };
      }

      return {
        accountId,
        success: false,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
  }

  async stopAll(): Promise<ActionResult[]> {
    const accountIds = this.accountManager.getAccountIds();
    const results = await Promise.allSettled(
      accountIds.map((accountId) => this.steamManager.stopBoost(accountId)),
    );

    return results.map((result, index) => {
      const accountId = accountIds[index] ?? "unknown";
      if (result.status === "fulfilled") {
        return {
          accountId,
          success: true,
          message: "Boosting stopped.",
        };
      }

      return {
        accountId,
        success: false,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
  }

  setStealthForAccount(accountId: string, mode: StealthMode): void {
    this.steamManager.setStealthMode(accountId, mode);
    this.logger.info({ accountId, mode }, "Stealth mode updated for account.");
  }

  setStealthForAll(mode: StealthMode): void {
    this.steamManager.setStealthModeAll(mode);
    this.logger.info({ mode }, "Stealth mode updated for all accounts.");
  }

  getStatus(): AccountSnapshot[] {
    return this.steamManager.getAllSnapshots();
  }
}

