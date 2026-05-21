import axios from "axios";
import type { AccountSnapshot, AccountSummary, GameOption, GuardChallenge } from "../types";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || window.location.origin,
  headers: { "Content-Type": "application/json" },
});

// ── Accounts ─────────────────────────────────────────────────────────────────
export const getAccounts = () =>
  http.get<{ accounts: AccountSummary[]; statuses: AccountSnapshot[] }>("/api/accounts")
    .then((r) => r.data);

export const addAccount = (payload: {
  id?: string;
  username: string;
  password: string;
  sharedSecret?: string;
  refreshToken?: string;
  proxy?: string;
  preferredAppIds?: number[];
}) => http.post<{ account: AccountSummary }>("/api/accounts", payload).then((r) => r.data.account);

// ── Status ────────────────────────────────────────────────────────────────────
export const getStatus = () =>
  http.get<{ accounts: AccountSnapshot[] }>("/api/status").then((r) => r.data.accounts);

// ── Boost control ─────────────────────────────────────────────────────────────
export const startAccount = (accountId: string, appIds: number[]) =>
  http.post(`/api/account/${accountId}/start`, { appIds }).then((r) => r.data);

export const stopAccount = (accountId: string) =>
  http.post(`/api/account/${accountId}/stop`).then((r) => r.data);

export const startAll = (appIds: number[]) =>
  http.post("/api/start", { appIds }).then((r) => r.data);

export const stopAll = () =>
  http.post("/api/stop").then((r) => r.data);

// ── Games ─────────────────────────────────────────────────────────────────────
export const updateGames = (accountId: string, appIds: number[]) =>
  http.post<{ account: AccountSummary }>(`/api/account/${accountId}/games`, { appIds })
    .then((r) => r.data.account);

export const getGameOptions = () =>
  http.get<{ gameOptions: GameOption[] }>("/api/game-options").then((r) => r.data.gameOptions);

export const searchGames = (q: string, limit = 20) =>
  http.get<{ results: Array<{ appid: number; name: string }> }>(
    `/api/game-search?q=${encodeURIComponent(q)}&limit=${limit}`,
  ).then((r) => r.data.results);

// ── Stealth ───────────────────────────────────────────────────────────────────
export const setStealth = (mode: string, accountId?: string) =>
  http.post("/api/stealth", { mode, accountId }).then((r) => r.data);

// ── Account removal ───────────────────────────────────────────────────────
export const removeAccount = (accountId: string) =>
  http.delete(`/api/account/${accountId}`).then((r) => r.data);

// ── Steam Guard ───────────────────────────────────────────────────────────────
export const getPendingGuards = () =>
  http.get<{ challenges: GuardChallenge[] }>("/api/guard/pending")
    .then((r) => r.data.challenges);

export const submitGuardCode = (accountId: string, code: string) =>
  http.post("/api/guard/submit", { accountId, code }).then((r) => r.data);
