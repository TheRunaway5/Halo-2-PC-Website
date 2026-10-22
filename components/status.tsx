"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PopulationCount, ServiceStatus } from "@/lib/types";
function seats(count: PopulationCount) {
  return count.guests ? `${count.users} + ${count.guests} guests` : count.users;
}
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
    <>
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
        <span>ONLINE ACCOUNTS</span>
        <b>{status?.online?.online.users ?? "—"}</b>
      </div>
      <div>
        <span>GUESTS ONLINE</span>
        <b>{status?.online?.online.guests ?? "—"}</b>
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
        <span>QUEUED ACCOUNTS</span>
        <b>{status?.online?.queued.users ?? "—"}</b>
      </div>
      <div>
        <span>PLAYING ACCOUNTS</span>
        <b>{status?.online?.playing.users ?? "—"}</b>
      </div>
      <a href="/leaderboard/">
        View service records <span>↗</span>
      </a>
    </div>
    <details className="playlist-population">
      <summary>Playlist population</summary>
      {status?.online ? (
        <>
          <p>
            Counts use authenticated activity within {status.online.activity_window_seconds} seconds or a live match connection.
            Menu accounts: {status.online.idle.users}. Guests are separate seats.
            Public server occupancy comes from server advertisements.
          </p>
          <div className="population-table">
            <table>
              <caption>Current playlist activity · refreshed {new Date(status.online.updated_at * 1000).toLocaleTimeString()}</caption>
              <thead><tr><th scope="col">Playlist</th><th scope="col">Online</th><th scope="col">Queued</th><th scope="col">Joining</th><th scope="col">Playing</th><th scope="col">Postgame</th></tr></thead>
              <tbody>{status.online.playlists.map((playlist) => (
                <tr key={playlist.id}>
                  <th scope="row">{playlist.name}</th>
                  <td>{seats(playlist.online)}</td><td>{seats(playlist.queued)}</td>
                  <td>{seats(playlist.joining)}</td><td>{seats(playlist.playing)}</td><td>{seats(playlist.postgame)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : <p>Online account and playlist counts are currently unavailable.</p>}
    </details>
    </>
  );
}
