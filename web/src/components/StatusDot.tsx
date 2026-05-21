import type { AccountStatus } from "../types";

const config: Record<AccountStatus, { color: string; cls: string; label: string }> = {
  BOOSTING:   { color: "var(--db-green)",         cls: "dot-boosting",   label: "Boosting"   },
  ONLINE:     { color: "rgba(255,255,255,0.42)",   cls: "",               label: "Online"     },
  CONNECTING: { color: "var(--db-orange)",         cls: "dot-connecting", label: "Connecting" },
  ERROR:      { color: "var(--db-red)",            cls: "",               label: "Error"      },
  OFFLINE:    { color: "rgba(255,255,255,0.2)",    cls: "",               label: "Offline"    },
};

interface Props {
  status: AccountStatus;
  size?: number;
  showLabel?: boolean;
}

export function StatusDot({ status, size = 7, showLabel = false }: Props) {
  const { color, cls, label } = config[status] ?? config.OFFLINE;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        className={cls}
        style={{
          display: "inline-block",
          width: size, height: size,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <span style={{ color, fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" }}>
          {label}
        </span>
      )}
    </span>
  );
}
