"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RankBadge } from "./rank-badge";
import { ArrowDown, ArrowUpRight, RefreshCw, Trophy } from "lucide-react";
import { api, label, playerLink, ratio } from "@/lib/api";
import type { Leaderboard, Sort } from "@/lib/types";
import { EmptyState, Loading, SectionTitle } from "./ui";
const sorts: { value: Sort; name: string }[] = [
  { value: "kills", name: "Total kills" },
  { value: "wins", name: "Wins" },
  { value: "kd", name: "K/D ratio" },
  { value: "games", name: "Matches played" },
];
export function LeaderboardView() {
  const [sort, setSort] = useState<Sort>("kills"),
    [playlist, setPlaylist] = useState(""),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<Leaderboard | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    api
      .leaders(sort, playlist, offset, c.signal)
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [sort, playlist, offset, refresh]);
  return (
    <div className="page-width interior">
      <SectionTitle
        number="01"
        eyebrow="COMMUNITY STANDINGS"
        title="The leaderboard."
      >
        <span className="page-tag">
          <Trophy size={15} /> ALL-TIME RECORDS
        </span>
      </SectionTitle>
      <p className="page-intro">
        A place in the history books. Explore combat statistics from recorded
        community matches.
      </p>
      <div className="filter-bar">
        <label>
          RANK BY
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setOffset(0);
            }}
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          PLAYLIST
          <select
            value={playlist}
            onChange={(e) => {
              setPlaylist(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All playlists</option>
            {data?.playlists.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          aria-label="Refresh leaderboard"
          onClick={() => setRefresh((x) => x + 1)}
          disabled={loading}
        >
          <RefreshCw size={17} />
        </button>
        <span className="filter-note">
          {data
            ? `${data.total.toLocaleString()} recorded players`
            : "Live master server data"}
        </span>
      </div>
      <div className="data-panel">
        <div className="panel-caption">
          <span>PLAYER STANDINGS</span>
          <span className="muted">
            {sorts.find((s) => s.value === sort)?.name.toUpperCase()}{" "}
            <ArrowDown size={12} />
          </span>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState title="Standings unavailable" error>
            {error}
          </EmptyState>
        ) : !data?.players.length ? (
          <EmptyState title="The next legend starts here.">
            There are no recorded matches for this selection yet. Standings
            appear after completed matches are published.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Skill</th>
                  <th scope="col">Matches</th>
                  <th scope="col">Wins</th>
                  <th scope="col">Kills</th>
                  <th scope="col">Deaths</th>
                  <th scope="col">K/D</th>
                  <th scope="col">
                    <span className="sr-only">Service record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id}>
                    <td className={p.position <= 3 ? "top-position" : ""}>
                      {String(p.position).padStart(2, "0")}
                    </td>
                    <td>
                      <Link className="player-cell" href={playerLink(p.id)}>
                        <span className="player-emblem">
                          {p.screen_name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{p.screen_name}</strong>
                          <small>@{p.discord_username}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <RankBadge skill={p.skill} />
                    </td>
                    <td>{p.games}</td>
                    <td>{p.wins}</td>
                    <td className="stat-highlight">
                      {p.kills.toLocaleString()}
                    </td>
                    <td>{p.deaths.toLocaleString()}</td>
                    <td>{ratio(p.kills, p.deaths)}</td>
                    <td>
                      <Link
                        href={playerLink(p.id)}
                        aria-label={`View ${p.screen_name}'s service record`}
                      >
                        <ArrowUpRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && data.total > 25 && (
        <div className="pagination">
          <button
            className="button secondary"
            disabled={!offset || loading}
            onClick={() => setOffset((x) => Math.max(0, x - 25))}
          >
            Previous
          </button>
          <span>
            Players {offset + 1}–{Math.min(offset + 25, data.total)} of{" "}
            {data.total}
          </span>
          <button
            className="button secondary"
            disabled={data.next === null || loading}
            onClick={() => setOffset(data.next ?? 0)}
          >
            Next
          </button>
        </div>
      )}
      <p className="data-note">
        Standings use recorded match totals, including ranked and unranked
        games. Wins count first-place finishes, including ties. K/D is kills
        divided by deaths; zero-death records sort first. Skill emblems show the
        selected playlist’s current level, or the highest recorded
        ranked-playlist level when viewing all playlists. Guest profiles are
        excluded.
      </p>
    </div>
  );
}
