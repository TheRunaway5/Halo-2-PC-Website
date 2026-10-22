"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SteamProfileLink } from "./steam-profile-link";
import { RankBadge } from "./rank-badge";
import { VistaIntro } from "./vista-motion";
import { ArrowLeft, Download, Medal } from "lucide-react";
import { api, date, label, playerLink, ratio } from "@/lib/api";
import type { Report } from "@/lib/types";
import { EmptyState, Loading, SectionTitle } from "./ui";
function IndexedStats({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: number[][];
}) {
  return (
    <details className="source-details">
      <summary>
        {title}
        <span>{rows.length} nonzero entries</span>
      </summary>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="data-note">No nonzero entries recorded.</p>
      )}
    </details>
  );
}
export function CarnageReport() {
  const id = useSearchParams().get("id");
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setReport(null);
    setError("");
    if (!id) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    api
      .report(id, c.signal)
      .then(setReport)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id]);
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `carnage-${report.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page-width interior">
      <Link className="text-link back-link" href="/players/">
        <ArrowLeft size={15} /> Player search
      </Link>
      <SectionTitle
        number="03"
        eyebrow="POSTGAME CARNAGE REPORT"
        title={report ? label(report.variant) : "The aftermath."}
      >
        {report && (
          <button className="button secondary" onClick={download}>
            <Download size={16} /> Download report
          </button>
        )}
      </SectionTitle>
      {loading ? (
        <Loading text="Retrieving carnage report" />
      ) : error ? (
        <EmptyState title="Report unavailable" error>
          {error}
        </EmptyState>
      ) : !report ? (
        <EmptyState title="Choose a match to begin.">
          Open a player’s service record and select any recorded match to view
          its carnage report.
        </EmptyState>
      ) : (
        <>
          <div className="report-meta">
            <div>
              <span>MAP</span>
              <strong>{label(report.map)}</strong>
            </div>
            <div>
              <span>PLAYLIST</span>
              <strong>{label(report.playlist)}</strong>
            </div>
            <div>
              <span>COMPLETED</span>
              <strong>{date(report.completed)}</strong>
            </div>
            <div>
              <span>TYPE</span>
              <strong>{report.ranked ? "Ranked" : "Unranked"}</strong>
            </div>
          </div>
          <VistaIntro className="data-panel" track="postgame" delay={150}>
            <div className="panel-caption">
              <span>FINAL STANDINGS</span>
              <span className="muted">
                {report.published_players} AUTHENTICATED PLAYERS
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Place",
                      "Player",
                      "Skill",
                      "Team",
                      "Score",
                      "Kills",
                      "Deaths",
                      "Assists",
                      "Suicides",
                      "K/D",
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...report.players]
                    .sort((a, b) => a.placement - b.placement)
                    .map((p) => (
                      <VistaIntro as="tr" track="player" delay={250} key={p.id}>
                        <td className={p.placement === 1 ? "top-position" : ""}>
                          {p.placement === 1 ? (
                            <Medal size={18} />
                          ) : (
                            p.placement
                          )}
                        </td>
                        <td>
                          <div className="player-name">
                            <Link className="match-name" href={playerLink(p.id)}>
                            <strong>
                              {p.screen_name_at_match ?? p.screen_name}
                            </strong>
                            </Link>
                            <SteamProfileLink player={p} />
                          </div>
                        </td>
                        <td>
                          <RankBadge skill={p.skill_at_match} />
                        </td>
                        <td>{p.team === null || p.team < 0 ? "—" : p.team}</td>
                        <td className="stat-highlight">{p.score}</td>
                        <td>{p.kills}</td>
                        <td>{p.deaths}</td>
                        <td>{p.assists}</td>
                        <td>{p.suicides}</td>
                        <td>{ratio(p.kills, p.deaths)}</td>
                      </VistaIntro>
                    ))}
                </tbody>
              </table>
            </div>
          </VistaIntro>
          {report.teams.length > 0 && (
            <div className="team-standings">
              <h2>Team results</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Place</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.teams.map((t) => (
                      <tr key={t.team}>
                        <td>Team {t.team}</td>
                        <td>{t.placement}</td>
                        <td>{t.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.teams.map((t) => (
                <IndexedStats
                  key={t.team}
                  title={`Team ${t.team} general statistics`}
                  headers={["Source index", "Value"]}
                  rows={t.general}
                />
              ))}
            </div>
          )}
          <div className="report-details">
            <p className="eyebrow">THE COMPLETE RECORD</p>
            <h2>Player breakdowns</h2>
            <p className="data-note">
              Detailed statistics retain their original source indices where
              names have not been verified. Sparse arrays list nonzero values.
              Older summary reports may have no detailed statistics.
            </p>
            {report.players.map((p) => (
              <details key={p.id} className="player-breakdown">
                <summary>
                  <span>{p.screen_name_at_match ?? p.screen_name}</span>
                  <span>
                    {p.details_available ? "View statistics" : "Summary only"}
                  </span>
                </summary>
                {p.details_available ? (
                  <>
                    <IndexedStats
                      title="General statistics"
                      headers={["Source index", "Value"]}
                      rows={p.general}
                    />
                    <IndexedStats
                      title="Medals"
                      headers={["Medal index", "Count"]}
                      rows={p.medals}
                    />
                    <IndexedStats
                      title="Weapon statistics"
                      headers={["Weapon index", "Field index", "Value"]}
                      rows={p.weapons}
                    />
                    <details className="source-details">
                      <summary>
                        Opponent statistics{" "}
                        <span>{p.opponents.length} opponents</span>
                      </summary>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Opponent</th>
                              <th>Source field 0</th>
                              <th>Source field 1</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.opponents.map((o) => (
                              <tr key={o.player}>
                                <td>
                                  <Link href={playerLink(o.player)}>
                                    {report.players.find(
                                      (x) => x.id === o.player,
                                    )?.screen_name_at_match ??
                                      report.players.find(
                                        (x) => x.id === o.player,
                                      )?.screen_name ??
                                      "Player"}
                                  </Link>
                                </td>
                                <td>{o.values[0]}</td>
                                <td>{o.values[1]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                    <p className="source-bytes">
                      Appearance bytes: {p.appearance ?? "Not recorded"} ·
                      Source slot: {p.slot ?? "Unknown"}
                    </p>
                  </>
                ) : (
                  <p className="data-note">
                    Detailed source data was not retained for this older match.
                  </p>
                )}
              </details>
            ))}
            <details className="source-details metadata-details">
              <summary>Match record details</summary>
              <dl>
                <dt>Public match ID</dt>
                <dd>{report.id}</dd>
                <dt>Format</dt>
                <dd>{report.format}</dd>
                <dt>Validation</dt>
                <dd>{report.validation}</dd>
                <dt>Playlist revision</dt>
                <dd>{report.revision}</dd>
                <dt>Admitted</dt>
                <dd>
                  {report.admitted_at
                    ? date(report.admitted_at)
                    : "Not recorded"}
                </dd>
                <dt>Admitted players</dt>
                <dd>{report.admitted_players ?? "Not recorded"}</dd>
                <dt>Selected variant bytes</dt>
                <dd className="source-bytes">
                  {report.variant_bytes ?? "Not recorded"}
                </dd>
              </dl>
            </details>
          </div>
          <p className="data-note">
            Guest personal details are excluded. Team totals may include guests.
            Reports reflect client-agreed results stored by the master server.
          </p>
        </>
      )}
    </div>
  );
}
