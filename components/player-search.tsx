"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RankBadge } from "./rank-badge";
import { SteamProfileLink } from "./steam-profile-link";
import { PlayerServiceRecord } from "./player-service-record";
import { VistaLoadingRings } from "./vista-motion";
import { ArrowRight, ArrowUpRight, Search, UserRound } from "lucide-react";
import { api, playerLink } from "@/lib/api";
import type { MatchPage, Player } from "@/lib/types";
import { DISPLAY_NAME_LIMIT, displayNameQuery } from "@/lib/player-search";
import { EmptyState, Loading, SectionTitle } from "./ui";
export function PlayerSearch() {
  const params = useSearchParams(),
    id = params.get("id");
  const [displayName, setDisplayName] = useState(params.get("q") ?? ""),
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
    const value = displayNameQuery(displayName);
    if (!value) {
      setLoading(false);
      setError(
        "Enter a display name using 1–64 characters.",
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
    <div className={`page-width interior${id ? " service-record-page" : ""}`}>
      {!history && <SectionTitle
        number="02"
        eyebrow="PLAYER SERVICE RECORDS"
        title={id ? "Player service record" : "Your story. On record."}
      >
        <span className="page-tag">
          <UserRound size={15} /> PLAYER ARCHIVE
        </span>
      </SectionTitle>}
      {!id ? (
        <>
          <p className="page-intro">
            Find a player. Relive the match. Explore every recorded carnage
            report.
          </p>
          <form className="search-form" onSubmit={search}>
            <label htmlFor="display-name">DISPLAY NAME</label>
            <div>
              <Search size={21} />
              <input
                id="display-name"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter a player’s display name"
                value={displayName}
                maxLength={DISPLAY_NAME_LIMIT}
                onChange={(e) => setDisplayName(e.target.value)}
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
              Search all or part of a player’s display name, regardless of
              capitalization. Hover over the Steam icon to see their Steam handle.
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
              Check the player’s display name or try a shorter part of it.
            </EmptyState>
          ) : results ? (
            <div className="search-results">
              {results.length === 50 && <p className="data-note">Showing up to 50 matches. Refine the display name to narrow your search.</p>}
              {results.map((p) => (
                <div className="search-result" key={p.id}>
                  <Link className="player-emblem" href={playerLink(p.id)} aria-label={`View ${p.screen_name}'s service record`}>
                    {p.screen_name.slice(0, 1).toUpperCase()}
                  </Link>
                  <div>
                    <h2 className="player-name"><Link href={playerLink(p.id)}>{p.screen_name}</Link><SteamProfileLink player={p} /></h2>
                  </div>
                  <RankBadge skill={p.skill} />
                  <Link className="search-result-action" href={playerLink(p.id)}>
                    View service record <ArrowUpRight size={17} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="archive-art" aria-hidden="true">
              <VistaLoadingRings className="archive-rings" />
              <span>EVERY SPARTAN HAS A STORY.</span>
            </div>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <Loading text="Retrieving service record" />
          ) : history ? (
            <PlayerServiceRecord history={history} loadingOlder={older} onLoadOlder={loadOlder} />
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
