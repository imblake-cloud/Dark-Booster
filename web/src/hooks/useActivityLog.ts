import { useEffect, useRef, useState } from "react";
import type { AccountSnapshot, AccountStatus } from "../types";

export type LogEntryType = "boosting" | "stopped" | "connected" | "reconnecting" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  accountId: string;
  username: string;
  type: LogEntryType;
  detail?: string;
}

export function useActivityLog(statuses: AccountSnapshot[]): LogEntry[] {
  const prevMap = useRef<Map<string, AccountStatus>>(new Map());
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    const entries: LogEntry[] = [];

    for (const snap of statuses) {
      const prev = prevMap.current.get(snap.id);

      if (prev === undefined) {
        prevMap.current.set(snap.id, snap.status);
        if (snap.status === "BOOSTING") {
          entries.push({
            id: `${snap.id}-init-${Date.now()}`,
            ts: snap.connectedAt ? new Date(snap.connectedAt).getTime() : Date.now(),
            accountId: snap.id,
            username: snap.username,
            type: "boosting",
            detail: `${snap.boostingAppIds.length} game${snap.boostingAppIds.length !== 1 ? "s" : ""}`,
          });
        }
        continue;
      }

      if (prev === snap.status) continue;
      prevMap.current.set(snap.id, snap.status);

      if (snap.status === "BOOSTING") {
        entries.push({
          id: `${snap.id}-${Date.now()}`,
          ts: Date.now(),
          accountId: snap.id,
          username: snap.username,
          type: "boosting",
          detail: `${snap.boostingAppIds.length} game${snap.boostingAppIds.length !== 1 ? "s" : ""}`,
        });
      } else if (snap.status === "ERROR") {
        entries.push({
          id: `${snap.id}-${Date.now()}`,
          ts: Date.now(),
          accountId: snap.id,
          username: snap.username,
          type: "error",
          detail: snap.lastError?.slice(0, 60),
        });
      } else if (snap.status === "OFFLINE" && (prev === "BOOSTING" || prev === "ONLINE")) {
        entries.push({
          id: `${snap.id}-${Date.now()}`,
          ts: Date.now(),
          accountId: snap.id,
          username: snap.username,
          type: "stopped",
        });
      } else if (snap.status === "ONLINE" && prev === "CONNECTING") {
        entries.push({
          id: `${snap.id}-${Date.now()}`,
          ts: Date.now(),
          accountId: snap.id,
          username: snap.username,
          type: "connected",
        });
      } else if (snap.status === "CONNECTING" && (prev === "BOOSTING" || prev === "ONLINE" || prev === "ERROR")) {
        entries.push({
          id: `${snap.id}-${Date.now()}`,
          ts: Date.now(),
          accountId: snap.id,
          username: snap.username,
          type: "reconnecting",
        });
      }
    }

    if (entries.length) {
      setLog((prev) => [...entries, ...prev].slice(0, 60));
    }
  }, [statuses]);

  return log;
}
