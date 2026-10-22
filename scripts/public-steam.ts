import type { DatabaseSync } from "node:sqlite";

export function publicSteam(db: DatabaseSync, publicId: string) {
  const row = db.prepare(`
    SELECT p.steam_name,i.subject FROM history_players h
    JOIN player_profiles p ON p.player=h.player
    JOIN player_identities i ON i.player=h.player AND i.provider='steam'
    WHERE h.public_id=?
  `).get(publicId);
  // Build the public URL only from the verified Steam identity. Persona and
  // Halo display names are mutable and cannot identify a Steam account.
  if (!row || typeof row.subject !== "string" || !/^[0-9]{17}$/.test(row.subject))
    return { steam_name: null, steam_profile_url: null };
  return {
    steam_name: String(row.steam_name),
    steam_profile_url: `https://steamcommunity.com/profiles/${row.subject}`,
  };
}
