import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { currentSkill } from "./public-ranks.ts";
const order = {
  kills: "kills DESC, wins DESC",
  wins: "wins DESC, kills DESC",
  games: "games DESC, kills DESC",
  kd: "CASE WHEN deaths=0 AND kills>0 THEN 1 ELSE 0 END DESC, kd DESC, kills DESC",
} as const;
export function leaderboard(db: DatabaseSync, params: URLSearchParams) {
  const allowed = new Set(["sort", "playlist", "limit", "offset"]);
  for (const key of params.keys())
    if (!allowed.has(key) || params.getAll(key).length !== 1)
      throw new Error("Invalid query fields");
  const sort = params.get("sort") ?? "kills";
  if (!Object.hasOwn(order, sort)) throw new Error("Invalid sort");
  const page = params.get("limit") ?? "25",
    start = params.get("offset") ?? "0";
  if (!/^\d{1,2}$/.test(page) || !/^\d{1,7}$/.test(start))
    throw new Error("Invalid pagination");
  const limit = Number(page),
    offset = Number(start);
  if (limit < 1 || limit > 50 || offset > 1000000)
    throw new Error("Invalid pagination");
  const playlist = params.get("playlist") ?? "";
  if (playlist.length > 128 || /[\x00-\x1f]/.test(playlist))
    throw new Error("Invalid playlist");
  const filter = playlist ? " AND m.playlist=?" : "";
  const args: SQLInputValue[] = playlist ? [playlist] : [];
  // The master writes authenticated result rows only. Inner joins preserve its
  // public-history boundary; private player IDs never leave this query.
  const from = ` FROM match_result_players r JOIN match_results m ON m.id=r.match
    JOIN history_players h ON h.player=r.player JOIN player_profiles p ON p.player=r.player
    WHERE p.discord_username!=''${filter}`;
  db.exec("BEGIN");
  try {
    const total = Number(
      db
        .prepare(`SELECT COUNT(DISTINCT h.public_id) AS total${from}`)
        .get(...args)!.total,
    );
    const players = db
      .prepare(
        `SELECT h.public_id AS id,p.screen_name,p.discord_username,
      COUNT(*) AS games,SUM(CASE WHEN r.placement=1 THEN 1 ELSE 0 END) AS wins,
      SUM(r.kills) AS kills,SUM(r.deaths) AS deaths,SUM(r.assists) AS assists,
      CASE WHEN SUM(r.deaths)=0 THEN 0.0 ELSE 1.0*SUM(r.kills)/SUM(r.deaths) END AS kd
      ${from} GROUP BY h.public_id ORDER BY ${order[sort as keyof typeof order]},h.public_id ASC LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, offset);
    const playlists = db
      .prepare(
        `SELECT DISTINCT m.playlist FROM match_results m
      JOIN match_result_players r ON r.match=m.id JOIN history_players h ON h.player=r.player
      JOIN player_profiles p ON p.player=r.player WHERE p.discord_username!='' ORDER BY m.playlist`,
      )
      .all()
      .map((x) => String(x.playlist));
    const entries = players.map((p, i) => ({
      id: String(p.id),
      skill: currentSkill(db, String(p.id), playlist || undefined),
      screen_name: String(p.screen_name),
      discord_username: String(p.discord_username),
      games: Number(p.games),
      wins: Number(p.wins),
      kills: Number(p.kills),
      deaths: Number(p.deaths),
      assists: Number(p.assists),
      kd: Number(p.kd),
      position: offset + i + 1,
    }));
    db.exec("COMMIT");
    return {
      players: entries,
      total,
      next: offset + limit < total ? offset + limit : null,
      sort,
      playlists,
      updated_at: Math.floor(Date.now() / 1000),
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
