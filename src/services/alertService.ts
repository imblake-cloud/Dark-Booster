import https from "node:https";
import http from "node:http";
import type { Logger } from "pino";
import type { SteamManager } from "../core/steamManager";
import { AccountStatus } from "../models/enums";

export class AlertService {
  private readonly prevStatuses = new Map<string, AccountStatus>();
  private readonly alertedGuards = new Set<string>();

  constructor(
    private readonly logger: Logger,
    private readonly steamManager: SteamManager,
    private readonly webhookUrl?: string,
  ) {
    if (!webhookUrl) return;
    steamManager.on("state_change", () => { this.onStateChange(); });
    steamManager.on("guards_change", () => { this.onGuardsChange(); });
  }

  private onStateChange(): void {
    const snapshots = this.steamManager.getAllSnapshots();
    for (const snap of snapshots) {
      const prev = this.prevStatuses.get(snap.id);
      if (prev !== snap.status) {
        if (snap.status === AccountStatus.ERROR && prev !== undefined) {
          void this.send(`⚠️ **${snap.username}** → ERROR: ${snap.lastError ?? "disconnected"}`);
        }
        this.prevStatuses.set(snap.id, snap.status as AccountStatus);
      }
    }
  }

  private onGuardsChange(): void {
    const challenges = this.steamManager.getPendingGuardChallenges();
    for (const c of challenges) {
      if (!this.alertedGuards.has(c.challengeId)) {
        this.alertedGuards.add(c.challengeId);
        void this.send(`🔐 **${c.username}** needs Steam Guard (${c.type}): ${c.message}`);
      }
    }
  }

  private send(content: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.webhookUrl) { resolve(); return; }

      const body = JSON.stringify({ content });
      let url: URL;
      try {
        url = new URL(this.webhookUrl);
      } catch {
        this.logger.warn("Invalid DISCORD_WEBHOOK_URL — skipping alert.");
        resolve();
        return;
      }

      const isHttps = url.protocol === "https:";
      const mod = isHttps ? https : http;

      const req = mod.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          port: url.port || (isHttps ? 443 : 80),
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
        },
      );

      req.on("error", (err) => {
        this.logger.warn({ err: err.message }, "Discord webhook request failed.");
        resolve();
      });

      req.write(body);
      req.end();
    });
  }
}
