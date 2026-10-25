import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { date, label, ratio, reportLink } from "@/lib/api";
import { joinedDate } from "@/lib/profile-appearance";
import type { MatchPage } from "@/lib/types";
import { PlayerAppearance, PlayerEmblem } from "./player-appearance";
import { RankBadge } from "./rank-badge";
import { SteamProfileLink } from "./steam-profile-link";
import { FriendTag } from "./friend-tag";
import { EmptyState } from "./ui";
import { VistaIntro } from "./vista-motion";

export function PlayerServiceRecord({ history, loadingOlder, onLoadOlder }: {
  history: MatchPage;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}) {
  const { player, matches, next } = history;
  const joined = joinedDate(player.joined_at);
  const stats = player.statistics;
  const ranked = player.skill && Number.isInteger(player.skill.level) && player.skill.level >= 1 && player.skill.level <= 50;
  return <>
    <div className="profile-wayfinding">
      <p className="eyebrow">02 / PLAYER SERVICE RECORDS</p>
      <Link className="text-link" href="/players/"><ArrowLeft size={15} /> Find another player</Link>
    </div>
    <VistaIntro className="service-record-header" track="panel">
      <PlayerEmblem player={player} />
      <div className="service-record-identity">
        <p className="eyebrow">SERVICE RECORD</p>
        <h1 className="player-name">{player.screen_name}<SteamProfileLink player={player} /></h1>
        <FriendTag key={player.friend_tag} tag={player.friend_tag} />
        <div className="profile-metadata">
          {player.service_tag && <span className="service-tag" aria-label={`Service tag ${player.service_tag}`}>{player.service_tag}</span>}
          <span>{joined ? `Joined ${joined}` : "Join date not recorded"}</span>
        </div>
      </div>
      {ranked && <RankBadge skill={player.skill} large />}
    </VistaIntro>
    <div className="service-record-body">
      <PlayerAppearance player={player} />
      <section className="profile-details data-panel" aria-labelledby="career-title">
        <div className="panel-caption"><h2 id="career-title">CAREER STATISTICS</h2><span className="muted">{player.statistics_source === "eos" ? "ALL TIME" : "RECORDED RESULTS"}</span></div>
        {stats ? <>
          <dl>
            <div><dt>Matches</dt><dd>{stats.matches.toLocaleString()}</dd></div>
            <div><dt>Kills / Deaths</dt><dd>{stats.kills.toLocaleString()} <span>/</span> {stats.deaths.toLocaleString()}</dd></div>
            <div><dt>K/D</dt><dd>{ratio(stats.kills, stats.deaths)}</dd></div>
            <div><dt>Shot accuracy</dt><dd>{stats.shots > 0 ? `${(100 * stats.hits / stats.shots).toFixed(1)}%` : "—"}</dd></div>
          </dl>
          {!stats.accuracy_complete && <p className="profile-accuracy-note">Accuracy covers {stats.accuracy_matches} matches with detailed weapon data.</p>}
        </> : <p className="profile-statistics-unavailable">No career statistics recorded yet.</p>}
      </section>
      <section className="profile-match-history" aria-labelledby="history-title">
        <div className="data-panel">
          <div className="panel-caption"><h2 id="history-title">MATCH HISTORY</h2><span className="muted">NEWEST FIRST</span></div>
          {!matches.length ? <EmptyState title="No matches recorded yet.">Completed matches and their carnage reports will appear here.</EmptyState> : (
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
                  {matches.map((m) => (
                    <VistaIntro as="tr" track="postgame" delay={150} key={m.id}>
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
                    </VistaIntro>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {next ? <div className="load-more">
          <button className="button secondary" disabled={loadingOlder} onClick={onLoadOlder}>
            {loadingOlder ? "Loading…" : "Load older matches"} <ArrowRight size={16} />
          </button>
        </div> : matches.length > 0 ? <p className="data-note">You’ve reached the beginning of this player’s recorded history.</p> : null}
      </section>
    </div>
  </>;
}
