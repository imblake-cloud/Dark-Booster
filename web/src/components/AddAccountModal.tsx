import { useState } from "react";
import { useStore } from "../store/useStore";
import { GameSelector } from "./GameSelector";

interface Props {
  onClose: () => void;
}

export function AddAccountModal({ onClose }: Props) {
  const addAccount  = useStore((s) => s.addAccount);
  const gameOptions = useStore((s) => s.gameOptions);
  const actionBusy  = useStore((s) => s.actionBusy);

  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [proxy,        setProxy]        = useState("");
  const [selectedIds,  setSelectedIds]  = useState<number[]>(gameOptions[0]?.appIds ?? []);
  const [err,          setErr]          = useState("");
  const [submitting,   setSubmitting]   = useState(false);

  const busy = actionBusy || submitting;

  const handleSubmit = async () => {
    if (!username.trim() || !password) { setErr("Username and password are required."); return; }
    setErr("");
    setSubmitting(true);
    try {
      await addAccount({
        username:        username.trim(),
        password,
        sharedSecret:    sharedSecret.trim() || undefined,
        proxy:           proxy.trim() || undefined,
        preferredAppIds: selectedIds,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.72)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 460,
        background: "var(--db-bg2)",
        border: "1px solid var(--db-border-2)",
        borderRadius: 20,
        padding: 24,
        maxHeight: "90vh", overflowY: "auto",
        position: "relative", overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,168,76,0.08)",
      }}>
        {/* Top gradient accent */}
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%",
          height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.5) 50%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(201,168,76,0.1)",
              border: "1px solid rgba(201,168,76,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v14M1 8h14" stroke="var(--db-accent)" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.025em" }}>Add Steam Account</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 1, fontWeight: 500 }}>Connect a new account</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.5)", fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.style.background = "rgba(255,255,255,0.09)";
              btn.style.color = "rgba(255,255,255,0.8)";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.style.background = "rgba(255,255,255,0.05)";
              btn.style.color = "rgba(255,255,255,0.5)";
            }}
          >×</button>
        </div>

        {/* Credentials */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          <input
            className="db-input"
            placeholder="Steam username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
            disabled={busy}
            autoFocus
          />
          <input
            className="db-input"
            type="password"
            placeholder="Steam password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
            disabled={busy}
          />
          <input
            className="db-input"
            placeholder="Shared secret (optional — auto 2FA)"
            value={sharedSecret}
            onChange={(e) => setSharedSecret(e.target.value)}
            disabled={busy}
          />
          <input
            className="db-input"
            placeholder="Proxy URL (optional)"
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Games */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 10, fontWeight: 800,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: 9,
          }}>
            Games to boost
          </div>
          <GameSelector
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            presets={gameOptions}
            disabled={busy}
          />
        </div>

        {err && (
          <div style={{
            background: "rgba(255,67,58,0.07)", border: "1px solid rgba(255,67,58,0.2)",
            borderRadius: 9, padding: "9px 13px",
            color: "var(--db-red)", fontSize: 12, marginBottom: 14, fontWeight: 500,
          }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 9 }}>
          <button
            className="db-btn db-btn-primary"
            style={{ flex: 1, height: 42, fontSize: 13, fontWeight: 700, borderRadius: 11 }}
            onClick={() => void handleSubmit()}
            disabled={busy}
          >
            {busy ? "Adding…" : "Add Account"}
          </button>
          <button
            className="db-btn db-btn-ghost"
            style={{ flex: 1, height: 42, fontSize: 13, borderRadius: 11 }}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
