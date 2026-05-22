import { useState } from "react";
import { useStore } from "../store/useStore";
import type { GuardChallenge } from "../types";

interface Props {
  challenge: GuardChallenge;
  onClose: () => void;
}

function WaitingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 22 }}>
      {[0, 0.22, 0.44].map((delay, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "rgba(255,159,10,0.9)",
          animation: `guard-pulse 1.4s ease-in-out ${delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

const APPROVE_STEPS = [
  "Open the Steam app on your phone.",
  "Tap the Steam Guard notification.",
  'Select where you\'re signing in from — choose "Steam app" or whichever matches.',
  'Tap "Confirm" or "Approve" — the login completes automatically.',
];

function ApproveSteps() {
  return (
    <div style={{ marginBottom: 20 }}>
      {APPROVE_STEPS.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
          <div style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
            background: "rgba(255,159,10,0.1)", border: "1px solid rgba(255,159,10,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, color: "rgba(255,159,10,0.9)",
            marginTop: 1,
          }}>
            {i + 1}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.68)", lineHeight: 1.65, fontWeight: 500 }}>
            {step}
          </p>
        </div>
      ))}
    </div>
  );
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
        width: 400,
        background: "var(--db-bg2)",
        border: "1px solid var(--db-border-2)",
        borderRadius: 20, padding: 26,
        boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,159,10,0.06)",
        position: "relative",
      }}>
        {/* Top amber gradient accent */}
        <div style={{
          position: "absolute", top: 0, left: "25%", right: "25%", height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,159,10,0.45) 50%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 13,
            background: "rgba(255,159,10,0.1)", border: "1px solid rgba(255,159,10,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
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

        {/* Steam's own message */}
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 18, lineHeight: 1.65, fontWeight: 500 }}>
          {challenge.message}
          {challenge.domain && (
            <>
              <br />
              <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}>
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

        {/* ── Approve flow ─────────────────────────────────────────────── */}
        {challenge.canApprove && (
          <>
            <div style={{
              background: "rgba(255,159,10,0.06)", border: "1px solid rgba(255,159,10,0.14)",
              borderRadius: 12, padding: "14px 16px", marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,159,10,0.8)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Waiting for mobile approval
              </div>
              <WaitingDots />
              <ApproveSteps />
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
                Dark Booster will log in automatically once you approve.
              </p>
            </div>
          </>
        )}

        {/* ── Code input ───────────────────────────────────────────────── */}
        {challenge.requiresCode && (
          <div style={{ marginBottom: 18 }}>
            {challenge.canApprove && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: "var(--db-border)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  or enter code manually
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--db-border)" }} />
              </div>
            )}
            <input
              className="db-input"
              type="text"
              placeholder="Steam Guard code — e.g. AB12C"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              autoFocus={!challenge.canApprove}
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

        {/* ── Actions ──────────────────────────────────────────────────── */}
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
            style={{ flex: challenge.requiresCode ? 1 : undefined, minWidth: 100, height: 42, fontSize: 13, borderRadius: 11 }}
            onClick={onClose}
          >
            {challenge.canApprove && !challenge.requiresCode ? "Cancel login" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
