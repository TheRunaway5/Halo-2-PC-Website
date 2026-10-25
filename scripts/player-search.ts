import type { DatabaseSync } from "node:sqlite";

export function createPlayerSearch(db: DatabaseSync) {
  // SQLite's built-in lower() handles ASCII only. Use the same Unicode casing
  // for both stored display names and the query; % and _ stay literal text.
  db.function("website_lower", { deterministic: true }, (name) =>
    String(name).normalize("NFC").toLowerCase(),
  );
  const tags = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player_friend_tags'").get();
  const tagJoin = tags ? "LEFT JOIN player_friend_tags t ON t.player=p.player" : "";
  const tagValue = tags ? "p.screen_name||'#'||t.discriminator" : "NULL";
  const search = db.prepare(`
    SELECT h.public_id AS id,p.screen_name,p.discord_username,${tagValue} AS friend_tag
    FROM history_players h JOIN player_profiles p ON p.player=h.player
    ${tagJoin}
    WHERE instr(website_lower(p.screen_name),?) > 0
    ORDER BY (website_lower(p.screen_name)=?) DESC,
      website_lower(p.screen_name),h.public_id
    LIMIT 50
  `);
  const exactTag = tags ? db.prepare(`SELECT h.public_id AS id,p.screen_name,p.discord_username,
    p.screen_name||'#'||t.discriminator AS friend_tag FROM player_friend_tags t
    JOIN player_profiles p ON p.player=t.player JOIN history_players h ON h.player=p.player
    WHERE t.discriminator=? AND website_lower(p.screen_name)=?`) : null;
  return (name: string) => {
    const match = /^(.*)#([0-9]{8})$/u.exec(name);
    if (match) return exactTag?.all(match[2], match[1].normalize("NFC").toLowerCase()) ?? [];
    const folded = name.normalize("NFC").toLowerCase();
    return search.all(folded, folded);
  };
}
