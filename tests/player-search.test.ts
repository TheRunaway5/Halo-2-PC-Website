import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createPlayerSearch } from "../scripts/player-search.ts";
import { displayNameQuery } from "../lib/player-search.ts";

test("display-name queries preserve spaces, punctuation, Unicode and leading @", () => {
  for (const name of ["Halo Pilot", "ÉLITE 試験", "@Pilot", "100%_Pilot", "O'Brien", "A"]) {
    assert.equal(displayNameQuery(`  ${name}  `), name);
  }
  for (const name of ["", "  ", "a".repeat(65), "Pilot\n", "Pi\u0000lot", "Pi\u007flot"]) {
    assert.equal(displayNameQuery(name), null);
  }
});

test("friend-tag search disambiguates duplicate names and follows renames without writing tags", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE history_players(player TEXT,public_id TEXT);
      CREATE TABLE player_profiles(player TEXT,screen_name TEXT,discord_username TEXT);
      CREATE TABLE player_friend_tags(player TEXT PRIMARY KEY,discriminator TEXT UNIQUE);
      INSERT INTO history_players VALUES('private-a','public-a'),('private-b','public-b'),('private-old','public-old');
      INSERT INTO player_profiles VALUES('private-a','Halo Pilot',''),('private-b','Halo Pilot',''),('private-old','Legacy','');
      INSERT INTO player_friend_tags VALUES('private-a','00000001'),('private-b','99999999');`);
    const search = createPlayerSearch(db);
    db.exec("PRAGMA query_only=ON");
    assert.equal(search("hALo pILot#00000001")[0].id, "public-a");
    assert.equal(search("Halo Pilot#99999999")[0].id, "public-b");
    assert.equal(search("Legacy")[0].friend_tag, null);
    assert.deepEqual(search("Other Name#00000001"), []);
    assert.deepEqual(search("Halo Pilot#12345678"), []);
    assert.ok(!JSON.stringify(search("Halo")).includes("private-"));
    db.exec("PRAGMA query_only=OFF; UPDATE player_profiles SET screen_name='New Name' WHERE player='private-a'; PRAGMA query_only=ON;");
    assert.deepEqual(search("Halo Pilot#00000001"), []);
    assert.equal(search("New Name#00000001")[0].id, "public-a");
    assert.equal(db.prepare("SELECT count(*) AS n FROM player_friend_tags").get()!.n, 2);
    assert.equal(displayNameQuery("a".repeat(64)+"#00000001"), "a".repeat(64)+"#00000001");
    assert.equal(displayNameQuery("a".repeat(65)+"#00000001"), null);
  } finally { db.close(); }
});

test("published display-name search is literal, case insensitive, bounded and independent of Discord", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE history_players(player TEXT,public_id TEXT);
      CREATE TABLE player_profiles(player TEXT,screen_name TEXT,discord_username TEXT);
    `);
    const insert = db.prepare("INSERT INTO player_profiles VALUES(?,?,?)");
    const publish = db.prepare("INSERT INTO history_players VALUES(?,?)");
    for (const [id, name] of [
      ["b", "Halo Pilot"], ["a", "Halo Pilot"], ["c", "Halo Pilot II"],
      ["unicode", "ÉLITE 試験"], ["literal", "100%_Pilot"], ["apostrophe", "O'Brien"],
      ["at", "@Pilot"],
    ]) {
      insert.run(`private-${id}`, name, "");
      publish.run(`private-${id}`, id);
    }
    insert.run("private-hidden", "Halo Pilot", "discord-only-handle");
    const search = createPlayerSearch(db);
    db.exec("PRAGMA query_only=ON");
    assert.deepEqual(search("hALo pILot").map((p) => p.id), ["a", "b", "c"]);
    assert.deepEqual(search("pilot").map((p) => p.id), ["literal", "at", "a", "b", "c"]);
    assert.deepEqual(search("élite").map((p) => p.id), ["unicode"]);
    assert.deepEqual(search("試験").map((p) => p.id), ["unicode"]);
    assert.deepEqual(search("%_").map((p) => p.id), ["literal"]);
    assert.deepEqual(search("O'BRIEN").map((p) => p.id), ["apostrophe"]);
    assert.deepEqual(search("@pilot").map((p) => p.id), ["at"]);
    assert.deepEqual(search("discord-only-handle"), []);
    assert.deepEqual(search("' OR 1=1 --"), []);
    assert.deepEqual(search("absent"), []);
    assert.ok(!JSON.stringify(search("Halo")).includes("private-"));
    db.exec("PRAGMA query_only=OFF");
    for (let i = 0; i < 60; i++) {
      insert.run(`private-many-${i}`, `Pilot ${i}`, "");
      publish.run(`private-many-${i}`, `many-${i}`);
    }
    db.exec("PRAGMA query_only=ON");
    assert.equal(search("Pilot").length, 50);
    // An exact match takes priority even when other substrings exceed the cap.
    assert.equal(search("Pilot 5")[0].screen_name, "Pilot 5");
  } finally {
    db.close();
  }
});
