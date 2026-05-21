import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { Sidebar } from "./Sidebar";
import { AccountDetail } from "./AccountDetail";
import { AddAccountModal } from "./AddAccountModal";
import { GuardModal } from "./GuardModal";

function formatTotalTime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const h    = Math.floor(secs / 3600);
  const m    = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function Dashboard() {
  const initialize    = useStore((s) => s.initialize);
  const loading       = useStore((s) => s.loading);
  const error         = useStore((s) => s.error);
  const statuses      = useStore((s) => s.statuses);
  const pendingGuards = useStore((s) => s.pendingGuards);
  const wsConnected   = useStore((s) => s.wsConnected);

  const [addOpen,      setAddOpen]      = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [, setTick]                    = useState(0);

  // Only show "disconnected" banner after we had a successful connection first
  const hadConnection = useRef(false);
  useEffect(() => { if (wsConnected) hadConnection.current = true; }, [wsConnected]);
  const showDisconnected = !wsConnected && hadConnection.current;

  useEffect(() => { void initialize(); }, [initialize]);

  // Prune dismissed IDs that are no longer in pendingGuards (challenges were resolved)
  useEffect(() => {
    const activeIds = new Set(pendingGuards.map((g) => g.challengeId));
    setDismissedIds((prev) => {
      const pruned = new Set([...prev].filter((id) => activeIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [pendingGuards]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const activeGuard    = pendingGuards.find((g) => !dismissedIds.has(g.challengeId)) ?? null;
  const boostingCount  = statuses.filter((s) => s.status === "BOOSTING").length;
  const errorAccounts  = statuses.filter((s) => s.status === "ERROR");

  const totalSessionMs = statuses
    .filter((s) => s.status === "BOOSTING" && s.connectedAt)
    .reduce((sum, s) => sum + (Date.now() - new Date(s.connectedAt!).getTime()), 0);

  if (loading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--db-bg)",
        flexDirection: "column", gap: 20,
      }}>
        <div style={{
          padding: 3,
          borderRadius: 18,
          background: "rgba(201,168,76,0.1)",
          border: "1px solid rgba(201,168,76,0.22)",
        }}>
          <img
            src="/logo.png"
            alt="Dark Booster"
            width={56}
            height={56}
            style={{ borderRadius: 14, display: "block", opacity: 0.95 }}
          />
        </div>
        <div className="db-progress-bar" style={{ width: 140 }} />
        <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, fontWeight: 500, letterSpacing: "0.02em" }}>
          Connecting…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--db-bg)", padding: 24 }}>
        <div className="db-card" style={{ padding: 32, textAlign: "center", maxWidth: 380 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "rgba(255,67,58,0.1)", border: "1px solid rgba(255,67,58,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3a7 7 0 100 14A7 7 0 0010 3zM10 7v5M10 14v.5" stroke="var(--db-red)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ color: "var(--db-red)", fontWeight: 700, fontSize: 15, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Connection Error
          </div>
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, lineHeight: 1.7 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--db-bg)", overflow: "hidden" }}>

      {/* ── Disconnected banner ─────────────────────────────────── */}
      {showDisconnected && (
        <div style={{
          background: "rgba(255,159,10,0.09)",
          borderBottom: "1px solid rgba(255,159,10,0.22)",
          padding: "6px 20px",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: "var(--db-orange)", fontWeight: 600,
        }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "var(--db-orange)", flexShrink: 0,
            animation: "pulse-orange 1.6s var(--spring-heavy) infinite",
          }} />
          Sin conexión — los datos mostrados pueden estar desactualizados. Reconectando…
        </div>
      )}

      {/* ── ERROR accounts banner ───────────────────────────────── */}
      {errorAccounts.length > 0 && (
        <div style={{
          background: "rgba(255,67,58,0.07)",
          borderBottom: "1px solid rgba(255,67,58,0.18)",
          padding: "6px 20px",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: "var(--db-red)", fontWeight: 600,
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M6.5 4v3M6.5 8.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {errorAccounts.length === 1
            ? `${errorAccounts[0]!.username} — error de conexión. Revisa la cuenta.`
            : `${errorAccounts.length} cuentas en error: ${errorAccounts.map((a) => a.username).join(", ")}`
          }
        </div>
      )}

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="db-navbar" style={{
        height: 54, flexShrink: 0,
        display: "flex", alignItems: "center",
        padding: "0 20px", gap: 14,
      }}>

        {/* Logo + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            className="db-logo-ring"
            style={{
              padding: 2,
              borderRadius: 10,
              background: "rgba(201,168,76,0.09)",
              border: "1px solid rgba(201,168,76,0.22)",
            }}
          >
            <img
              className="db-logo-img"
              src="/logo.png"
              alt="Dark Booster"
              width={26}
              height={26}
              style={{ borderRadius: 7, display: "block" }}
            />
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.03em", color: "rgba(228,215,185,0.92)" }}>
            Dark Booster
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Guard alert pill */}
        {pendingGuards.length > 0 && (
          <button
            className="db-btn"
            onClick={() => setDismissedIds(new Set())}
            style={{
              background: "rgba(255,159,10,0.08)",
              border: "1px solid rgba(255,159,10,0.22)",
              color: "var(--db-orange)",
              borderRadius: 9999,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 700,
              gap: 5,
            }}
          >
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: "var(--db-orange)",
              boxShadow: "0 0 0 3px rgba(255,159,10,0.2)",
            }} />
            {pendingGuards.length} guard{pendingGuards.length !== 1 ? "s" : ""} pending
          </button>
        )}

        {/* Boosting status pill */}
        {boostingCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(201,168,76,0.07)",
            border: "1px solid rgba(201,168,76,0.18)",
            borderRadius: 9999, padding: "4px 12px",
            fontSize: 11, color: "var(--db-boost)", fontWeight: 700,
          }}>
            <span
              className="dot-boosting"
              style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--db-boost)" }}
            />
            {boostingCount} boosting
            {totalSessionMs > 60_000 && (
              <span style={{
                color: "rgba(201,168,76,0.45)",
                fontFamily: "var(--font-mono)", fontWeight: 500,
                fontSize: 11,
              }}>
                · {formatTotalTime(totalSessionMs)}
              </span>
            )}
          </div>
        )}
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar onAdd={() => setAddOpen(true)} />
        <main style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          <AccountDetail />
        </main>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {addOpen && <AddAccountModal onClose={() => setAddOpen(false)} />}
      {activeGuard && (
        <GuardModal
          challenge={activeGuard}
          onClose={() =>
            setDismissedIds((prev) => new Set([...prev, activeGuard.challengeId]))
          }
        />
      )}
    </div>
  );
}
