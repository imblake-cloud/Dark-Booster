import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { StatusDot } from "./StatusDot";
import { GameSelector } from "./GameSelector";
import { useActivityLog } from "../hooks/useActivityLog";
import * as api from "../services/api";
import type { StealthMode } from "../types/index";

const stealthOptions: { value: StealthMode; label: string; desc: string }[] = [
  { value: "normal",    label: "Normal",    desc: "Visible online" },
  { value: "invisible", label: "Invisible", desc: "Hidden"         },
  { value: "offline",   label: "Offline",   desc: "Appear offline" },
];

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const logColors = {
  boosting:     { dot: "var(--db-boost)",        text: "rgba(201,168,76,0.9)"   },
  stopped:      { dot: "rgba(255,255,255,0.25)", text: "rgba(255,255,255,0.38)" },
  connected:    { dot: "rgba(255,255,255,0.35)", text: "rgba(255,255,255,0.45)" },
  reconnecting: { dot: "var(--db-orange)",       text: "rgba(255,159,10,0.85)"  },
  error:        { dot: "var(--db-red)",          text: "rgba(255,67,58,0.9)"    },
};

const logLabels = {
  boosting:     "Started boosting",
  stopped:      "Stopped",
  connected:    "Connected",
  reconnecting: "Reconnecting…",
  error:        "Error",
};

const steamImg = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_sm_120.jpg`;

export function AccountDetail() {
  const accounts      = useStore((s) => s.accounts);
  const statuses      = useStore((s) => s.statuses);
  const selectedId    = useStore((s) => s.selectedId);
  const gameOptions   = useStore((s) => s.gameOptions);
  const actionBusy    = useStore((s) => s.actionBusy);
  const startAccount  = useStore((s) => s.startAccount);
  const stopAccount   = useStore((s) => s.stopAccount);
  const updateGames   = useStore((s) => s.updateGames);
  const removeAccount = useStore((s) => s.removeAccount);

  const account = accounts.find((a) => a.id === selectedId) ?? null;
  const snap    = statuses.find((s) => s.id === selectedId) ?? null;

  const [selectedIds,   setSelectedIds]   = useState<number[]>([]);
  const [stealth,       setStealth]       = useState<StealthMode>("invisible");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [savingPref,    setSavingPref]    = useState(false);
  const [savedPref,     setSavedPref]     = useState(false);
  const [stealthSaved,  setStealthSaved]  = useState(false);
  const [stealthBusy,   setStealthBusy]   = useState(false);
  const [sessionSecs,   setSessionSecs]   = useState(0);
  const [nameCache,     setNameCache]     = useState<Map<number, string>>(new Map());

  const allLog     = useActivityLog(statuses);
  const accountLog = allLog.filter((e) => e.accountId === selectedId);

  const isBoosting   = snap?.status === "BOOSTING";
  const isConnecting = snap?.status === "CONNECTING";

  useEffect(() => {
    setSelectedIds(account?.preferredAppIds ?? []);
    setStealth(snap?.stealthMode ?? "invisible");
    setSavedPref(false);
    setConfirmRemove(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!isBoosting || !snap?.connectedAt) { setSessionSecs(0); return; }
    const start = new Date(snap.connectedAt).getTime();
    const tick  = () => setSessionSecs(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isBoosting, snap?.connectedAt]);

  const getGameName = (id: number): string => {
    if (nameCache.has(id)) return nameCache.get(id)!;
    for (const opt of gameOptions) {
      if (opt.appIds.length === 1 && opt.appIds[0] === id) return opt.label;
    }
    return `App ${id}`;
  };

  const handleNamesResolved = (entries: Array<[number, string]>) => {
    setNameCache((prev) => {
      const next = new Map(prev);
      entries.forEach(([id, name]) => next.set(id, name));
      return next;
    });
  };

  const handleStart = async () => {
    if (!account) return;
    await startAccount(account.id, selectedIds);
  };

  const handleStop = async () => {
    if (!account) return;
    await stopAccount(account.id);
  };

  const handleRemove = async () => {
    if (!account) return;
    await removeAccount(account.id);
  };

  const handleSavePref = async () => {
    if (!account) return;
    setSavingPref(true);
    try {
      await updateGames(account.id, selectedIds);
      setSavedPref(true);
      setTimeout(() => setSavedPref(false), 2000);
    } finally {
      setSavingPref(false);
    }
  };

  const handleStealthChange = async (mode: StealthMode) => {
    if (!account || stealthBusy) return;
    setStealth(mode);
    setStealthBusy(true);
    try {
      await api.setStealth(mode, account.id);
      setStealthSaved(true);
      setTimeout(() => setStealthSaved(false), 1500);
    } finally {
      setStealthBusy(false);
    }
  };

  if (!account) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        padding: 32,
      }}>
        <div style={{
          padding: 4,
          borderRadius: "50%",
          background: "rgba(201,168,76,0.06)",
          border: "1px solid rgba(201,168,76,0.14)",
          boxShadow: "0 0 32px rgba(201,168,76,0.05)",
        }}>
          <img
            src="/logo.png"
            alt="Dark Booster"
            width={52}
            height={52}
            style={{ borderRadius: "50%", display: "block", opacity: 0.45, filter: "grayscale(0.3)" }}
          />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "rgba(228,215,185,0.3)", fontWeight: 600, letterSpacing: "-0.01em" }}>
            No account selected
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.14)", marginTop: 4, fontWeight: 400 }}>
            Choose an account from the sidebar to manage it
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key={selectedId}
      className="db-fade-up"
      style={{
        flex: 1, overflowY: "auto",
        padding: "22px 24px",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 18,
        padding: "18px 20px",
        background: "var(--db-bg1)",
        border: "1px solid var(--db-border-2)",
        borderRadius: 18,
        position: "relative", overflow: "hidden",
      }}>
        {/* Subtle radial glow behind avatar when boosting */}
        {isBoosting && (
          <div style={{
            position: "absolute", left: -20, top: "50%",
            transform: "translateY(-50%)",
            width: 160, height: 160, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
        )}

        {/* Double-bezel avatar */}
        <div style={{
          padding: 3, borderRadius: "50%",
          background: isBoosting
            ? "linear-gradient(135deg, rgba(201,168,76,0.35), rgba(201,168,76,0.07))"
            : "rgba(201,168,76,0.08)",
          border: `1.5px solid ${isBoosting ? "rgba(201,168,76,0.38)" : "rgba(201,168,76,0.2)"}`,
          boxShadow: isBoosting ? "0 0 22px rgba(201,168,76,0.15)" : "0 0 16px rgba(201,168,76,0.06)",
          transition: "all 0.4s var(--spring)",
          flexShrink: 0,
          position: "relative", zIndex: 1,
        }}>
          {snap?.avatarUrl ? (
            <img
              src={snap.avatarUrl}
              alt={account.username}
              style={{
                width: 62, height: 62,
                borderRadius: "50%", objectFit: "cover", display: "block",
              }}
            />
          ) : (
            <div style={{
              width: 62, height: 62, borderRadius: "50%",
              background: "linear-gradient(135deg, #1c1810 0%, #2e2616 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, fontWeight: 800, color: "rgba(228,215,185,0.5)",
            }}>
              {account.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
          <div style={{
            fontWeight: 800, fontSize: 20,
            letterSpacing: "-0.03em", marginBottom: 5,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {account.username}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StatusDot status={snap?.status ?? "OFFLINE"} showLabel />
            {account.proxy && (
              <span style={{
                fontSize: 10, color: "rgba(210,190,155,0.32)",
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(210,185,130,0.04)",
                border: "1px solid rgba(210,185,130,0.08)",
                borderRadius: 6, padding: "2px 7px",
              }}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1"/>
                  <ellipse cx="4.5" cy="4.5" rx="1.5" ry="3.5" stroke="currentColor" strokeWidth="1"/>
                  <path d="M1 4.5h7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                {account.proxy}
              </span>
            )}
          </div>
        </div>

        {/* Remove */}
        <div style={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
          {!confirmRemove ? (
            <button
              className="db-btn db-btn-ghost"
              style={{ fontSize: 11, color: "rgba(201,64,64,0.55)", borderColor: "rgba(201,64,64,0.15)" }}
              onClick={() => setConfirmRemove(true)}
              disabled={actionBusy}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 2.5h7M4.5 2.5V2a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v.5M3 2.5l.5 7h4l.5-7"
                  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Remove
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(210,190,155,0.38)" }}>Remove?</span>
              <button
                className="db-btn"
                style={{ padding: "5px 10px", fontSize: 11, background: "rgba(255,67,58,0.12)", border: "1px solid rgba(255,67,58,0.25)", color: "var(--db-red)", borderRadius: 8 }}
                onClick={() => void handleRemove()}
                disabled={actionBusy}
              >Yes</button>
              <button
                className="db-btn db-btn-ghost"
                style={{ padding: "5px 10px", fontSize: 11 }}
                onClick={() => setConfirmRemove(false)}
              >No</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────── */}
      {snap?.lastError && (
        <div style={{
          background: "rgba(255,67,58,0.07)", border: "1px solid rgba(255,67,58,0.2)",
          borderRadius: 12, padding: "11px 15px",
          color: "var(--db-red)", fontSize: 12,
          display: "flex", alignItems: "flex-start", gap: 9,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 4v3.5M7 9v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={{ lineHeight: 1.55 }}>{snap.lastError}</span>
        </div>
      )}

      {/* ── ACTIVE SESSION STRIP ────────────────────────────────── */}
      {isBoosting && (
        <div
          className="db-session-strip db-fade-up"
          style={{ animationDelay: "40ms", padding: 0 }}
        >
          {/* Top accent line */}
          <div style={{
            height: 2,
            background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.7) 35%, rgba(201,168,76,0.7) 65%, transparent)",
          }} />

          <div style={{ padding: "14px 18px 20px" }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <span className="dot-boosting" style={{
                display: "inline-block", width: 7, height: 7,
                borderRadius: "50%", background: "var(--db-boost)", flexShrink: 0,
              }} />
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
                color: "var(--db-boost)",
                background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.22)",
                borderRadius: 5, padding: "2px 7px",
              }}>LIVE</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
                · {snap.boostingAppIds.length} game{snap.boostingAppIds.length !== 1 ? "s" : ""}
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="db-btn db-btn-red"
                style={{ height: 28, padding: "0 12px", fontSize: 11, borderRadius: 8 }}
                onClick={() => void handleStop()}
                disabled={actionBusy}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <rect x="0.5" y="0.5" width="7" height="7" rx="1.5" fill="currentColor"/>
                </svg>
                Stop
              </button>
            </div>

            {/* Split-digit timer */}
            {(() => {
              const h = Math.floor(sessionSecs / 3600);
              const m = Math.floor((sessionSecs % 3600) / 60);
              const s = sessionSecs % 60;
              const units: Array<{ v: number; l: string }> = [
                { v: h, l: "HRS" },
                { v: m, l: "MIN" },
                { v: s, l: "SEC" },
              ];
              return (
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  {units.flatMap((unit, i) => {
                    const block = (
                      <div key={unit.l} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52 }}>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 600,
                          letterSpacing: "-0.03em", color: "rgba(201,168,76,0.92)",
                          fontVariantNumeric: "tabular-nums", lineHeight: 1,
                        }}>
                          {String(unit.v).padStart(2, "0")}
                        </div>
                        <div style={{
                          fontSize: 9, fontWeight: 700, marginTop: 5,
                          color: "rgba(201,168,76,0.32)", letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}>
                          {unit.l}
                        </div>
                      </div>
                    );
                    if (i === 0) return [block];
                    return [
                      <div key={`sep-${i}`} style={{
                        fontSize: 26, fontWeight: 400, lineHeight: 1,
                        color: "rgba(201,168,76,0.22)", fontFamily: "var(--font-mono)",
                        padding: "0 3px 19px",
                      }}>:</div>,
                      block,
                    ];
                  })}
                </div>
              );
            })()}

            {/* Game thumbnails */}
            {snap.boostingAppIds.length > 0 && (
              <div style={{
                display: "flex", gap: 6, marginTop: 18,
                overflowX: "auto", paddingBottom: 2,
              }}>
                {snap.boostingAppIds.map((appid) => (
                  <div key={appid} style={{
                    flexShrink: 0, position: "relative",
                    borderRadius: 6, overflow: "hidden",
                    border: "1px solid rgba(201,168,76,0.18)",
                    background: "rgba(0,0,0,0.4)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  }}>
                    <img
                      src={steamImg(appid)}
                      alt={getGameName(appid)}
                      style={{ display: "block", width: 90, height: 34, objectFit: "cover" }}
                      onError={(e) => { (e.target as HTMLImageElement).closest("div")!.remove(); }}
                    />
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
                      height: 16,
                    }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 2-col: Game Selection LEFT | Stealth RIGHT ──────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 12, alignItems: "start" }}>

        {/* Game Selection */}
        <div className="db-card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 14, height: 1, background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.45))", flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(201,168,76,0.48)", textTransform: "uppercase", letterSpacing: "0.14em", whiteSpace: "nowrap" }}>
              Game Selection
            </span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(201,168,76,0.15), transparent)" }} />
            <button
              className="db-btn db-btn-ghost"
              style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6,
                color: savedPref ? "var(--db-gold)" : undefined }}
              onClick={() => void handleSavePref()}
              disabled={actionBusy || savingPref || isBoosting}
              title="Save selected games as preferred for this account"
            >
              {savedPref ? "✓ Saved" : savingPref ? "Saving…" : "Save preferred"}
            </button>
          </div>

          <GameSelector
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            presets={gameOptions}
            disabled={actionBusy}
            onNamesResolved={handleNamesResolved}
          />

          <div style={{ height: 1, background: "rgba(201,168,76,0.07)", margin: "16px 0" }} />

          <button
            className="db-btn db-btn-primary"
            style={{
              width: "100%", height: 44, fontSize: 13, fontWeight: 800,
              borderRadius: 8, letterSpacing: "-0.02em",
              opacity: (isBoosting || isConnecting || selectedIds.length === 0) ? 0.32 : 1,
            }}
            onClick={() => void handleStart()}
            disabled={actionBusy || isBoosting || isConnecting || selectedIds.length === 0}
          >
            {isBoosting ? (
              <>
                <span className="dot-boosting" style={{
                  display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "currentColor",
                }} />
                Boosting…
              </>
            ) : isConnecting ? (
              <>
                <div style={{
                  width: 11, height: 11, borderRadius: "50%",
                  border: "2px solid rgba(201,168,76,0.3)", borderTopColor: "var(--db-gold)",
                  animation: "spin 0.6s linear infinite",
                }} />
                Connecting…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 1.5l8 4.5-8 4.5V1.5z" fill="currentColor"/>
                </svg>
                Start Boosting
                {selectedIds.length > 0 && (
                  <span style={{
                    opacity: 0.55, fontWeight: 600, fontSize: 11,
                    background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "1px 7px",
                  }}>
                    {selectedIds.length} game{selectedIds.length !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            )}
          </button>
        </div>

        {/* Stealth */}
        <div className="db-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 14, height: 1, background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.45))", flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(201,168,76,0.48)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
              Stealth
            </span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(201,168,76,0.15), transparent)" }} />
            {stealthSaved && (
              <span style={{ fontSize: 10, color: "var(--db-gold)", fontWeight: 700 }}>Saved ✓</span>
            )}
          </div>
          <div className="db-card-inset" style={{ display: "flex", padding: 3, borderRadius: 8 }}>
            {stealthOptions.map((opt) => {
              const isActive = stealth === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void handleStealthChange(opt.value)}
                  disabled={stealthBusy}
                  style={{
                    flex: 1, padding: "8px 0",
                    borderRadius: 6, cursor: stealthBusy ? "default" : "pointer",
                    border: "none", textAlign: "center",
                    background: isActive ? "rgba(201,168,76,0.1)" : "transparent",
                    color: isActive ? "var(--db-gold)" : "rgba(210,190,155,0.32)",
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    transition: "background 0.15s var(--spring), color 0.15s var(--spring)",
                    boxShadow: isActive ? "inset 0 1px 0 rgba(201,168,76,0.12)" : "none",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Activity Log (full width) ────────────────────────────── */}
      <div className="db-card" style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 14, height: 1, background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.45))", flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(201,168,76,0.48)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Activity
          </span>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(201,168,76,0.15), transparent)" }} />
        </div>
        {accountLog.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(210,190,155,0.2)", padding: "6px 0", fontWeight: 500 }}>
            No recent activity
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            {accountLog.slice(0, 10).map((entry) => {
              const c = logColors[entry.type];
              return (
                <div key={entry.id} style={{
                  display: "flex", alignItems: "baseline", gap: 8,
                  padding: "5px 0",
                  borderBottom: "1px solid rgba(210,185,130,0.045)",
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: c.dot, flexShrink: 0, marginTop: 1,
                    display: "inline-block",
                  }} />
                  <span style={{
                    fontSize: 11, color: c.text, flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontWeight: 500,
                  }}>
                    {logLabels[entry.type]}
                    {entry.detail && (
                      <span style={{ opacity: 0.5 }}> · {entry.detail}</span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 10, color: "rgba(210,190,155,0.2)",
                    fontFamily: "var(--font-mono)", flexShrink: 0,
                  }}>
                    {formatLogTime(entry.ts)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
