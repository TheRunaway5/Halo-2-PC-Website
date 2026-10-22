import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { publicSteam } from "../scripts/public-steam.ts";

test("Steam links follow the verified linked identity, independently of Halo and Discord names", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE history_players(player TEXT,public_id TEXT);
      CREATE TABLE player_profiles(player TEXT,steam_name TEXT);
      CREATE TABLE player_identities(player TEXT,provider TEXT,subject TEXT);
      INSERT INTO history_players VALUES('private-linked','public-linked'),('private-other','public-other');
      INSERT INTO player_profiles VALUES('private-linked','Same Persona'),('private-other','Same Persona');
      INSERT INTO player_identities VALUES('private-linked','discord','discord-id'),
        ('private-linked','steam','76561198000000001'),('private-other','steam','76561198000000002');
    `);
    assert.deepEqual(publicSteam(db, "public-linked"), {
      steam_name: "Same Persona",
      steam_profile_url: "https://steamcommunity.com/profiles/76561198000000001",
    });
    assert.equal(publicSteam(db, "public-other").steam_profile_url, "https://steamcommunity.com/profiles/76561198000000002");
    db.exec("UPDATE player_profiles SET steam_name='Renamed Steam Pilot' WHERE player='private-linked'");
    assert.equal(publicSteam(db, "public-linked").steam_name, "Renamed Steam Pilot");
    assert.equal(publicSteam(db, "public-linked").steam_profile_url, "https://steamcommunity.com/profiles/76561198000000001");
    db.exec("DELETE FROM player_identities WHERE provider='steam' AND player='private-linked'");
    assert.deepEqual(publicSteam(db, "public-linked"), { steam_name: null, steam_profile_url: null });
    db.exec("UPDATE player_identities SET subject='https://example.com' WHERE provider='steam'");
    assert.deepEqual(publicSteam(db, "public-other"), { steam_name: null, steam_profile_url: null });
    assert.deepEqual(publicSteam(db, "missing"), { steam_name: null, steam_profile_url: null });
  } finally {
    db.close();
  }
});
