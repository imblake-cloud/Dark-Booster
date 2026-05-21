import { create } from "zustand";
import * as api from "../services/api";
import { createWsClient } from "../services/wsClient";
import type { AccountSnapshot, AccountSummary, GameOption, GuardChallenge, StealthMode } from "../types/index";

interface State {
  // Data
  accounts:     AccountSummary[];
  statuses:     AccountSnapshot[];
  pendingGuards:GuardChallenge[];
  gameOptions:  GameOption[];

  // UI
  selectedId:   string | null;
  loading:      boolean;
  actionBusy:   boolean;
  error:        string | null;
  wsConnected:  boolean;

  // Actions
  initialize:        () => Promise<void>;
  selectAccount:     (id: string | null) => void;
  refresh:           () => Promise<void>;
  addAccount:        (input: Parameters<typeof api.addAccount>[0]) => Promise<void>;
  startAccount:      (id: string, appIds: number[]) => Promise<void>;
  stopAccount:       (id: string) => Promise<void>;
  startAll:          (appIds: number[]) => Promise<void>;
  stopAll:           () => Promise<void>;
  setStealth:        (mode: StealthMode, accountId?: string) => Promise<void>;
  updateGames:       (id: string, appIds: number[]) => Promise<void>;
  removeAccount:     (id: string) => Promise<void>;
  submitGuardCode:   (accountId: string, code: string) => Promise<void>;
  setStatuses:       (statuses: AccountSnapshot[]) => void;
  setGuards:         (guards: GuardChallenge[]) => void;
}

let wsCleanup: (() => void) | null = null;

export const useStore = create<State>((set, get) => ({
  accounts:      [],
  statuses:      [],
  pendingGuards: [],
  gameOptions:   [],
  selectedId:    null,
  loading:       false,
  actionBusy:    false,
  error:         null,
  wsConnected:   false,

  initialize: async () => {
    set({ loading: true, error: null });
    try {
      const [{ accounts, statuses }, guards, gameOptions] = await Promise.all([
        api.getAccounts(),
        api.getPendingGuards(),
        api.getGameOptions(),
      ]);

      const selectedId = accounts[0]?.id ?? null;
      set({ accounts, statuses, pendingGuards: guards, gameOptions, selectedId, loading: false });

      // Start WebSocket for real-time updates
      wsCleanup?.();
      wsCleanup = createWsClient({
        onMessage: (msg) => {
          if (msg.type === "status") {
            get().setStatuses(msg.data as AccountSnapshot[]);
          } else if (msg.type === "guards") {
            get().setGuards(msg.data as GuardChallenge[]);
          }
        },
        onConnect:    () => set({ wsConnected: true }),
        onDisconnect: () => set({ wsConnected: false }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      set({ loading: false, error: message });
    }
  },

  selectAccount: (id) => set({ selectedId: id }),

  refresh: async () => {
    try {
      const { accounts, statuses } = await api.getAccounts();
      const guards = await api.getPendingGuards();
      set((s) => ({
        accounts,
        statuses,
        pendingGuards: guards,
        selectedId: s.selectedId ?? accounts[0]?.id ?? null,
      }));
    } catch {
      // silently ignore refresh errors
    }
  },

  addAccount: async (input) => {
    set({ actionBusy: true });
    try {
      const account = await api.addAccount(input);
      set((s) => ({
        accounts: [...s.accounts, account],
        selectedId: s.selectedId ?? account.id,
        actionBusy: false,
      }));
    } catch (err) {
      set({ actionBusy: false });
      throw err;
    }
  },

  startAccount: async (id, appIds) => {
    set({ actionBusy: true });
    try { await api.startAccount(id, appIds); }
    finally { set({ actionBusy: false }); }
  },

  stopAccount: async (id) => {
    set({ actionBusy: true });
    try { await api.stopAccount(id); }
    finally { set({ actionBusy: false }); }
  },

  startAll: async (appIds) => {
    set({ actionBusy: true });
    try { await api.startAll(appIds); }
    finally { set({ actionBusy: false }); }
  },

  stopAll: async () => {
    set({ actionBusy: true });
    try { await api.stopAll(); }
    finally { set({ actionBusy: false }); }
  },

  setStealth: async (mode, accountId) => {
    set({ actionBusy: true });
    try { await api.setStealth(mode, accountId); }
    finally { set({ actionBusy: false }); }
  },

  updateGames: async (id, appIds) => {
    const updated = await api.updateGames(id, appIds);
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, preferredAppIds: updated.preferredAppIds } : a)),
    }));
  },

  removeAccount: async (id) => {
    set({ actionBusy: true });
    try {
      await api.removeAccount(id);
      set((s) => {
        const accounts = s.accounts.filter((a) => a.id !== id);
        const selectedId = s.selectedId === id ? (accounts[0]?.id ?? null) : s.selectedId;
        return { accounts, statuses: s.statuses.filter((st) => st.id !== id), selectedId, actionBusy: false };
      });
    } catch (err) {
      set({ actionBusy: false });
      throw err;
    }
  },

  submitGuardCode: async (accountId, code) => {
    set({ actionBusy: true });
    try { await api.submitGuardCode(accountId, code); }
    finally { set({ actionBusy: false }); }
  },

  setStatuses: (statuses) => set({ statuses }),
  setGuards:   (pendingGuards) => set({ pendingGuards }),
}));
