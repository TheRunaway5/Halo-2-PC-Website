import type { DatabaseSync } from "node:sqlite";

export function createPlayerSearch(db: DatabaseSync) {
  // SQLite's built-in lower() handles ASCII only. Use the same Unicode casing
  // for both stored display names and the query; % and _ stay literal text.
  db.function("website_lower", { deterministic: true }, (name) =>
    String(name).toLowerCase(),
  );
  const search = db.prepare(`
    SELECT h.public_id AS id,p.screen_name,p.discord_username
    FROM history_players h JOIN player_profiles p ON p.player=h.player
    WHERE instr(website_lower(p.screen_name),?) > 0
    ORDER BY (website_lower(p.screen_name)=?) DESC,
      website_lower(p.screen_name),h.public_id
    LIMIT 50
  `);
  return (name: string) => search.all(name.toLowerCase(), name.toLowerCase());
}
