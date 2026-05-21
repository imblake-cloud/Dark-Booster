import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { AccountStatus } from "../types";

const statusOrder: AccountStatus[] = ["BOOSTING", "ONLINE", "CONNECTING", "ERROR", "OFFLINE"];

function formatShortElapsed(connectedAt: string): string {
  const ms = Date.now() - new Date(connectedAt).getTime();
  const s  = Math.floor(ms / 1000);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}m`;
}

const statusLabel: Record<AccountStatus, string> = {
  BOOSTING:   "Boosting",
  ONLINE:     "Online",
  CONNECTING: "Connecting",
  ERROR:      "Error",
  OFFLINE:    "Offline",
};

const statusColor: Record<AccountStatus, string> = {
  BOOSTING:   "var(--db-boost)",
  ONLINE:     "rgba(255,255,255,0.4)",
  CONNECTING: "var(--db-orange)",
  ERROR:      "var(--db-red)",
  OFFLINE:    "rgba(255,255,255,0.2)",
};

export function Sidebar({ onAdd }: { onAdd: () => void }) {
  const accounts      = useStore((s) => s.accounts);
  const statuses      = useStore((s) => s.statuses);
  const selectedId    = useStore((s) => s.selectedId);
  const selectAccount = useStore((s) => s.selectAccount);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...accounts].sort((a, b) => {
    const sa = statuses.find((s) => s.id === a.id)?.status ?? "OFFLINE";
    const sb = statuses.find((s) => s.id === b.id)?.status ?? "OFFLINE";
    return statusOrder.indexOf(sa) - statusOrder.indexOf(sb);
  });

  const boostingCount = statuses.filter((s) => s.status === "BOOSTING").length;

  return (
    <aside style={{
      width: 258, minWidth: 258,
      background: "rgba(17,17,20,0.95)",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* ── Header ───────────────────────────────────────────── */}
      <div style={{
        padding: "16px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontSize: 10, fontWeight: 800,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            Accounts
          </span>
          {boostingCount > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(201,168,76,0.07)",
              border: "1px solid rgba(201,168,76,0.18)",
              borderRadius: 9999,
              padding: "2px 8px",
            }}>
              <span
                className="dot-boosting"
                style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "var(--db-boost)" }}
              />
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--db-boost)" }}>
                {boostingCount}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Account list ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {sorted.length === 0 && (
          <div style={{
            padding: "32px 12px", textAlign: "center",
            color: "rgba(255,255,255,0.2)", fontSize: 12, lineHeight: 1.8,
          }}>
            No accounts yet.<br />
            <span style={{ color: "rgba(255,255,255,0.13)" }}>Click + Add below.</span>
          </div>
        )}

        {sorted.map((account) => {
          const snap       = statuses.find((s) => s.id === account.id);
          const status     = snap?.status ?? "OFFLINE";
          const active     = selectedId === account.id;
          const isBoosting = status === "BOOSTING";
          const color      = statusColor[status];

          const subLine = (() => {
            if (isBoosting && snap?.connectedAt) {
              const count   = snap.boostingAppIds?.length ?? 0;
              const elapsed = formatShortElapsed(snap.connectedAt);
              return { text: `${count} game${count !== 1 ? "s" : ""} · ${elapsed}`, mono: true };
            }
            if (status === "ERROR")      return { text: snap?.lastError?.slice(0, 24) ?? "Error", mono: false };
            if (status === "CONNECTING") return { text: "Connecting…", mono: false };
            return { text: statusLabel[status], mono: false };
          })();

          return (
            <button
              key={account.id}
              onClick={() => selectAccount(account.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "9px 10px",
                background: active ? "rgba(255,255,255,0.04)" : "transparent",
                borderRadius: 12,
                boxShadow: active ? `inset 2px 0 0 ${color}, inset 0 0 0 1px rgba(255,255,255,0.06)` : "none",
                border: "none",
                cursor: "pointer", textAlign: "left",
                transition: "background 0.18s var(--spring), box-shadow 0.18s var(--spring)",
                marginBottom: 2,
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {/* Double-bezel avatar */}
              <div style={{
                padding: 2,
                borderRadius: "50%",
                background: isBoosting
                  ? "linear-gradient(135deg, rgba(201,168,76,0.35), rgba(201,168,76,0.1))"
                  : "rgba(255,255,255,0.05)",
                border: `1px solid ${isBoosting ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.08)"}`,
                flexShrink: 0,
                transition: "border-color 0.3s var(--spring), background 0.3s var(--spring)",
              }}>
                {snap?.avatarUrl ? (
                  <img
                    src={snap.avatarUrl}
                    alt={account.username}
                    style={{
                      width: 34, height: 34,
                      borderRadius: "50%", objectFit: "cover", display: "block",
                    }}
                  />
                ) : (
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "linear-gradient(135deg, #25252e 0%, #3a3a58 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)",
                  }}>
                    {account.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Text info */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: active ? "#fff" : "rgba(255,255,255,0.82)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                }}>
                  {account.username}
                </div>
                <div style={{
                  fontSize: 10, marginTop: 1,
                  color,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontFamily: subLine.mono ? "var(--font-mono)" : "inherit",
                  fontWeight: subLine.mono ? 500 : 500,
                }}>
                  {subLine.text}
                </div>
              </div>

              {/* Status dot */}
              <span
                className={isBoosting ? "dot-boosting" : status === "CONNECTING" ? "dot-connecting" : ""}
                style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                  background: color, flexShrink: 0,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* ── Add button ───────────────────────────────────────── */}
      <div style={{
        padding: "12px 14px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button
          onClick={onAdd}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "9px 16px",
            background: "rgba(201,168,76,0.08)",
            border: "1px solid rgba(201,168,76,0.2)",
            borderRadius: 11,
            color: "rgba(201,168,76,0.9)",
            fontSize: 12, fontWeight: 700,
            fontFamily: "var(--font-sans)",
            cursor: "pointer", letterSpacing: "-0.01em",
            transition: "background 0.18s var(--spring), border-color 0.18s, color 0.18s",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.background = "rgba(201,168,76,0.14)";
            btn.style.borderColor = "rgba(201,168,76,0.35)";
            btn.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.background = "rgba(201,168,76,0.08)";
            btn.style.borderColor = "rgba(201,168,76,0.2)";
            btn.style.color = "rgba(201,168,76,0.9)";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Add Account
        </button>
      </div>
    </aside>
  );
}
