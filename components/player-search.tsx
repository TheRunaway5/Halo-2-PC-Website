"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RankBadge } from "./rank-badge";
import { ArrowRight, ArrowUpRight, Search, UserRound } from "lucide-react";
import { api, date, label, playerLink, ratio, reportLink } from "@/lib/api";
import type { MatchPage, Player } from "@/lib/types";
import { EmptyState, Loading, SectionTitle } from "./ui";
export function PlayerSearch() {
  const params = useSearchParams(),
    id = params.get("id");
  const [username, setUsername] = useState(params.get("q") ?? ""),
    [results, setResults] = useState<Player[] | null>(null),
    [history, setHistory] = useState<MatchPage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [older, setOlder] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);
  const olderAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    setHistory(null);
    setError("");
    olderAbort.current?.abort();
    setOlder(false);
    if (!id) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    api
      .matches(id, undefined, c.signal)
      .then(setHistory)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id]);
  useEffect(
    () => () => {
      searchAbort.current?.abort();
      olderAbort.current?.abort();
    },
    [],
  );
  async function search(e: React.FormEvent) {
    e.preventDefault();
    searchAbort.current?.abort();
    const value = username.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_.]{2,32}$/.test(value)) {
      setLoading(false);
      setError(
        "Enter an exact Discord username, using 2–32 letters, numbers, underscores or periods.",
      );
      return;
    }
    const c = new AbortController();
    searchAbort.current = c;
    setError("");
    setResults(null);
    setLoading(true);
    try {
      const data = await api.search(value, c.signal);
      if (!c.signal.aborted) setResults(data.players);
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  async function loadOlder() {
    if (!history?.next || !id) return;
    const c = new AbortController();
    olderAbort.current = c;
    setOlder(true);
    setError("");
    try {
      const next = await api.matches(id, history.next, c.signal);
      if (!c.signal.aborted)
        setHistory((current) =>
          current
            ? { ...next, matches: [...current.matches, ...next.matches] }
            : next,
        );
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setOlder(false);
    }
  }
  return (
    <div className="page-width interior">
      <SectionTitle
        number="02"
        eyebrow="PLAYER SERVICE RECORDS"
        title={history ? history.player.screen_name : "Your story. On record."}
      >
        <span className="page-tag">
          <UserRound size={15} /> PLAYER ARCHIVE
        </span>
      </SectionTitle>
      {!id ? (
        <>
          <p className="page-intro">
            Find a player. Relive the match. Explore every recorded carnage
            report.
          </p>
          <form className="search-form" onSubmit={search}>
            <label htmlFor="username">DISCORD USERNAME</label>
            <div>
              <Search size={21} />
              <input
                id="username"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter an exact Discord username"
                value={username}
                maxLength={33}
                onChange={(e) => setUsername(e.target.value)}
                aria-describedby="search-help"
                required
              />
              <button
                className="button primary"
                type="submit"
                disabled={loading}
              >
                Find player <ArrowRight size={17} />
              </button>
            </div>
            <p id="search-help">
              Use the player’s current verified Discord username. Names are
              matched exactly, regardless of capitalization.
            </p>
          </form>
          {loading ? (
            <Loading text="Searching player records" />
          ) : error ? (
            <EmptyState title="Search needs attention" error>
              {error}
            </EmptyState>
          ) : results?.length === 0 ? (
            <EmptyState title="No service record found.">
              Check the Discord username and try again. Players appear after
              their first recorded match.
            </EmptyState>
          ) : results ? (
            <div className="search-results">
              {results.map((p) => (
                <Link key={p.id} href={playerLink(p.id)}>
                  <span className="player-emblem">
                    {p.screen_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h2>{p.screen_name}</h2>
                    <p>@{p.discord_username}</p>
                  </div>
                  <RankBadge skill={p.skill} />
                  <span>
                    View service record <ArrowUpRight size={17} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="archive-art" aria-hidden="true">
              <img src="/vista/vista-loading-thin-mechanical-ring.svg" alt="" />
              <span>EVERY SPARTAN HAS A STORY.</span>
            </div>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <Loading text="Retrieving service record" />
          ) : history ? (
            <>
              <p className="page-intro">
                @{history.player.discord_username}{" "}
                <span className="muted">/</span> Recorded match history
              </p>
              <div className="profile-strip">
                <span className="player-emblem large">
                  {history.player.screen_name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="eyebrow">SERVICE RECORD</p>
                  <h2>{history.player.screen_name}</h2>
                </div>
                <RankBadge skill={history.player.skill} large />
                <Link className="text-link" href="/players/">
                  Find another player <Search size={15} />
                </Link>
              </div>
              <div className="data-panel">
                <div className="panel-caption">
                  <span>POSTGAME CARNAGE REPORTS</span>
                  <span className="muted">NEWEST FIRST</span>
                </div>
                {!history.matches.length ? (
                  <EmptyState title="No matches recorded yet.">
                    Completed matches will appear here.
                  </EmptyState>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Match</th>
                          <th scope="col">Date</th>
                          <th scope="col">Place</th>
                          <th scope="col">Kills</th>
                          <th scope="col">Deaths</th>
                          <th scope="col">K/D</th>
                          <th scope="col">Report</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.matches.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <Link
                                className="match-name"
                                href={reportLink(m.id)}
                              >
                                <strong>{label(m.variant)}</strong>
                                <small>
                                  {label(m.map)} · {label(m.playlist)}
                                </small>
                              </Link>
                            </td>
                            <td className="date-cell">{date(m.completed)}</td>
                            <td>
                              <span
                                className={
                                  m.placement === 1
                                    ? "placement winner"
                                    : "placement"
                                }
                              >
                                {m.placement === 1 ? "1ST" : `#${m.placement}`}
                              </span>
                            </td>
                            <td className="stat-highlight">{m.kills}</td>
                            <td>{m.deaths}</td>
                            <td>{ratio(m.kills, m.deaths)}</td>
                            <td>
                              <Link
                                href={reportLink(m.id)}
                                aria-label={`Open ${label(m.variant)} report from ${date(m.completed)}`}
                              >
                                <ArrowUpRight size={18} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {history.next ? (
                <div className="load-more">
                  <button
                    className="button secondary"
                    disabled={older}
                    onClick={loadOlder}
                  >
                    {older ? "Loading…" : "Load older matches"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <p className="data-note">
                  You’ve reached the beginning of this player’s recorded
                  history.
                </p>
              )}
            </>
          ) : null}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
        </>
      )}
      <p className="data-note">
        Only authenticated player records are published. Names in individual
        reports reflect the names used at the time of the match.
      </p>
    </div>
  );
}
