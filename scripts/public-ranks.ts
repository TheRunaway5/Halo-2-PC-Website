import type { DatabaseSync } from "node:sqlite";
export interface PublicSkill {
  level: number;
  playlist: string;
  configuration: string;
}
function displayed(
  row: Record<string, unknown> | undefined,
): PublicSkill | null {
  if (!row) return null;
  // Exact display_level(raw) from the master's playlist_skill.py: raw 49..127
  // share frame 49. Publish display level only, never raw skill or XP.
  return {
    level: Math.min(Number(row.raw_rank), 49) + 1,
    playlist: String(row.playlist),
    configuration: String(row.configuration),
  };
}
export function currentSkill(
  db: DatabaseSync,
  publicId: string,
  playlist?: string,
): PublicSkill | null {
  return displayed(
    db
      .prepare(
        `SELECT s.raw_rank,s.playlist,s.configuration FROM playlist_skill s
    JOIN history_players h ON h.player=s.player WHERE h.public_id=?
    AND EXISTS(SELECT 1 FROM match_result_players r JOIN match_results m ON m.id=r.match
      WHERE r.player=s.player AND m.playlist=s.playlist AND m.ranked=1)
    ${playlist ? "AND s.playlist=?" : ""} ORDER BY MIN(s.raw_rank,49) DESC,s.playlist ASC LIMIT 1`,
      )
      .get(...(playlist ? [publicId, playlist] : [publicId])),
  );
}
export function skillsAtMatch(
  db: DatabaseSync,
  publicMatchId: string,
): Map<string, PublicSkill | null> {
  return new Map(
    db
      .prepare(
        `SELECT h.public_id,s.raw_rank,m.playlist,s.configuration FROM match_result_skill s
    JOIN carnage_reports c ON c.match=s.match JOIN match_results m ON m.id=s.match
    JOIN history_players h ON h.player=s.player WHERE c.public_id=? AND m.ranked=1`,
      )
      .all(publicMatchId)
      .map((row) => [String(row.public_id), displayed(row)]),
  );
}
