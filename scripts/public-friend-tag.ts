import type { DatabaseSync } from "node:sqlite";

export function createPublicFriendTag(db: DatabaseSync) {
  const available = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player_friend_tags'").get();
  const read = available ? db.prepare(`SELECT p.screen_name,t.discriminator
    FROM history_players h JOIN player_profiles p ON p.player=h.player
    JOIN player_friend_tags t ON t.player=h.player WHERE h.public_id=?`) : null;
  return (publicId: string) => {
    const row = read?.get(publicId);
    return { friend_tag: row ? `${row.screen_name}#${row.discriminator}` : null };
  };
}
