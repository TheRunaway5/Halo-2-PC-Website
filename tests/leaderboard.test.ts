import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { leaderboard } from "../scripts/leaderboard-store.ts";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
 CREATE TABLE match_results(id TEXT PRIMARY KEY,playlist TEXT,ranked INTEGER DEFAULT 1);
 CREATE TABLE playlist_skill(player TEXT,playlist TEXT,configuration TEXT,raw_rank INTEGER,xp INTEGER);
 CREATE TABLE match_result_players(match TEXT,player TEXT,placement INTEGER,kills INTEGER,deaths INTEGER,assists INTEGER);
 CREATE TABLE history_players(player TEXT,public_id TEXT);
 CREATE TABLE player_profiles(player TEXT,screen_name TEXT,discord_username TEXT);
 INSERT INTO match_results(id,playlist) VALUES('m1','slayer'),('m2','team_slayer'),('m3','slayer');
 INSERT INTO player_profiles VALUES('private-a','Alpha','alpha'),('private-b','Bravo','bravo'),('guest','Guest',''),('unknown','Unknown','unknown');
 INSERT INTO history_players VALUES('private-a','public-a'),('private-b','public-b'),('guest','public-guest');
 INSERT INTO match_result_players VALUES('m1','private-a',1,20,8,2),('m2','private-a',2,5,2,1),('m1','private-b',2,15,0,3),('m2','private-b',1,12,4,0),('m3','guest',1,999,0,0),('m3','unknown',1,999,0,0);`);
  return db;
}
test("aggregates authenticated public players and excludes private identifiers and guests", () => {
  const db = fixture();
  try {
    const result = leaderboard(db, new URLSearchParams());
    assert.equal(result.total, 2);
    assert.equal(result.players[0].id, "public-b");
    assert.equal(result.players[1].kills, 25);
    assert.equal(result.players[1].games, 2);
    assert.equal(result.players[1].wins, 1);
    assert.equal(result.players[1].kd, 2.5);
    assert.ok(!JSON.stringify(result).includes("private-"));
    assert.ok(!JSON.stringify(result).includes("Guest"));
  } finally {
    db.close();
  }
});
test("playlist filters, zero deaths and stable pagination", () => {
  const db = fixture();
  try {
    const first = leaderboard(
      db,
      new URLSearchParams("sort=kd&playlist=slayer&limit=1"),
    );
    assert.equal(first.players[0].id, "public-b");
    assert.equal(first.next, 1);
    const second = leaderboard(
      db,
      new URLSearchParams("sort=kd&playlist=slayer&limit=1&offset=1"),
    );
    assert.equal(second.players[0].id, "public-a");
    assert.equal(second.players[0].position, 2);
    assert.equal(second.next, null);
    assert.deepEqual(first.playlists, ["slayer", "team_slayer"]);
  } finally {
    db.close();
  }
});
test("rejects injected sorts, unknown/repeated fields, and unbounded pagination", () => {
  const db = fixture();
  try {
    for (const query of [
      "sort=toString",
      "sort=kills;DROP TABLE players",
      "offset=-1",
      "limit=0",
      "limit=51",
      "limit=1&limit=2",
      "extra=1",
      "offset=1000001",
    ])
      assert.throws(
        () => leaderboard(db, new URLSearchParams(query)),
        /Invalid/,
      );
  } finally {
    db.close();
  }
});
test("empty history produces empty standings", () => {
  const db = fixture();
  try {
    db.exec("DELETE FROM match_result_players");
    const r = leaderboard(db, new URLSearchParams());
    assert.deepEqual(r.players, []);
    assert.equal(r.total, 0);
    assert.equal(r.next, null);
  } finally {
    db.close();
  }
});
