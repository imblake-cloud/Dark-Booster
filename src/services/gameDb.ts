import type { Logger } from "pino";

const STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch/";

export interface AppEntry {
  appid: number;
  name: string;
}

interface StoreSearchResponse {
  total?: number;
  items?: Array<{ id: number; type: string; name: string }>;
}

export class GameDb {
  constructor(
    private readonly logger: Logger,
    private readonly _cacheFile: string,
  ) {}

  // No-op: live search requires no pre-loading
  async ensureLoaded(): Promise<void> {}

  async search(query: string, limit = 20): Promise<AppEntry[]> {
    const q = query.trim();
    if (!q) return [];

    const numId = Number(q);
    const isRawId = Number.isInteger(numId) && numId > 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `${STORE_SEARCH_URL}?term=${encodeURIComponent(q)}&cc=US&l=english`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json() as StoreSearchResponse;

      const results: AppEntry[] = (data.items ?? [])
        .filter((item) => item.type === "app")
        .slice(0, limit)
        .map((item) => ({ appid: item.id, name: item.name }));

      if (isRawId && !results.some((r) => r.appid === numId)) {
        results.unshift({ appid: numId, name: `App ${numId}` });
      }

      return results.slice(0, limit);
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Game search request failed.",
      );
      return isRawId ? [{ appid: numId, name: `App ${numId}` }] : [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
