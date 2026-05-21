import { useState } from "react";
import { useStore } from "../store/useStore";
import type { GuardChallenge } from "../types";

interface Props {
  challenge: GuardChallenge;
  onClose: () => void;
}

export function GuardModal({ challenge, onClose }: Props) {
  const submitGuardCode = useStore((s) => s.submitGuardCode);
  const actionBusy      = useStore((s) => s.actionBusy);
  const [code, setCode] = useState("");
  const [err,  setErr]  = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) { setErr("Enter the code."); return; }
    setErr("");
    try {
      await submitGuardCode(challenge.accountId, code.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to submit code.");
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
        width: 380,
        background: "var(--db-bg2)",
        border: "1px solid var(--db-border-2)",
        borderRadius: 20, padding: 26,
        boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,159,10,0.06)",
        position: "relative",
      }}>
        {/* Top amber gradient accent */}
        <div style={{
          position: "absolute", top: 0, left: "25%", right: "25%",
          height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,159,10,0.45) 50%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 13,
            background: "rgba(255,159,10,0.1)",
            border: "1px solid rgba(255,159,10,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zM10 9v4.5M10 7h.01"
                stroke="#ff9f0a" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.025em" }}>Steam Guard</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 1, fontWeight: 500 }}>
              {challenge.username}
            </div>
          </div>
        </div>

        <p style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, marginBottom: 18, lineHeight: 1.65, fontWeight: 500 }}>
          {challenge.message}
          {challenge.domain && (
            <>
              <br />
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                Domain: {challenge.domain}
              </span>
            </>
          )}
        </p>

        {challenge.lastCodeWrong && (
          <div style={{
            background: "rgba(255,67,58,0.08)", border: "1px solid rgba(255,67,58,0.2)",
            borderRadius: 10, padding: "9px 13px", marginBottom: 14,
            color: "var(--db-red)", fontSize: 12, fontWeight: 500,
          }}>
            Code was incorrect. Try again.
          </div>
        )}

        {challenge.requiresCode && (
          <div style={{ marginBottom: 18 }}>
            <input
              className="db-input"
              type="text"
              placeholder="Steam Guard code — e.g. AB12C"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              autoFocus
              maxLength={8}
              style={{
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                textAlign: "center",
                fontSize: 16, fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            />
            {err && (
              <p style={{ color: "var(--db-red)", fontSize: 11, marginTop: 7, fontWeight: 500 }}>{err}</p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 9 }}>
          {challenge.requiresCode && (
            <button
              className="db-btn db-btn-primary"
              style={{ flex: 1, height: 42, fontSize: 13, fontWeight: 700, borderRadius: 11 }}
              onClick={() => void handleSubmit()}
              disabled={actionBusy}
            >
              Submit Code
            </button>
          )}
          <button
            className="db-btn db-btn-ghost"
            style={{ flex: 1, height: 42, fontSize: 13, borderRadius: 11 }}
            onClick={onClose}
          >
            {challenge.requiresCode ? "Cancel" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
