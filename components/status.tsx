"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ServiceStatus } from "@/lib/types";
export function Status() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api
        .status(c.signal)
        .then((value) => {
          if (!c.signal.aborted) {
            setStatus(value);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!c.signal.aborted) {
            setStatus(null);
            setFailed(true);
          }
        });
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      c.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return (
    <div className="network-strip">
      <div>
        <span className={`status-dot ${status?.ready ? "online" : ""}`} />
        <strong>
          {status?.ready
            ? "MASTER SERVER ONLINE"
            : failed
              ? "SERVICE STATUS UNAVAILABLE"
              : "CHECKING MASTER SERVER"}
        </strong>
      </div>
      <div>
        <span>PUBLIC SERVERS</span>
        <b>{status?.servers ?? "—"}</b>
      </div>
      <div>
        <span>PLAYERS IN PUBLIC SERVERS</span>
        <b>{status?.players ?? "—"}</b>
      </div>
      <div>
        <span>IN MATCHMAKING</span>
        <b>{status?.matchmaking_players ?? "—"}</b>
      </div>
      <a href="/leaderboard/">
        View service records <span>↗</span>
      </a>
    </div>
  );
}
