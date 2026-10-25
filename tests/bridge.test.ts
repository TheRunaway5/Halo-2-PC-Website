import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
test("HTTP bridge restricts methods and routes, isolates auth, and scopes CORS", async () => {
  const directory = await mkdtemp(join(tmpdir(), "halo2-website-"));
  const database = join(directory, "registry.sqlite3");
  const db = new DatabaseSync(database);
  const playerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const matchId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  db.exec(`
    CREATE TABLE history_players(player TEXT,public_id TEXT);
    CREATE TABLE player_profiles(player TEXT,steam_name TEXT,screen_name TEXT,discord_username TEXT);
    CREATE TABLE player_identities(player TEXT,provider TEXT,subject TEXT);
    CREATE TABLE player_friend_tags(player TEXT PRIMARY KEY,discriminator TEXT UNIQUE);
    CREATE TABLE playlist_skill(player TEXT,playlist TEXT,configuration TEXT,raw_rank INTEGER);
    CREATE TABLE match_results(id TEXT,playlist TEXT,ranked INTEGER);
    CREATE TABLE match_result_players(match TEXT,player TEXT);
    CREATE TABLE match_result_skill(match TEXT,player TEXT,raw_rank INTEGER,configuration TEXT);
    CREATE TABLE carnage_reports(match TEXT,public_id TEXT);
    INSERT INTO history_players VALUES('private-player','${playerId}'),
      ('private-other','cccccccc-cccc-cccc-cccc-cccccccccccc');
    INSERT INTO player_profiles VALUES('private-player','Steam Pilot','Halo Pilot','pilot'),
      ('private-other','Other Steam Handle','Halo Pilot',''),
      ('private-unpublished','Unpublished','Halo Pilot','');
    INSERT INTO player_identities VALUES('private-player','steam','76561198000000001'),
      ('private-other','steam','76561198000000002');
    INSERT INTO player_friend_tags VALUES('private-player','00000001'),('private-other','99999999');
  `);
  db.close();
  const upstream = createServer((req, res) => {
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    res.setHeader("Content-Type", "application/json");
    const player = { id: playerId, screen_name: "Halo Pilot", discord_username: "pilot" };
    if (req.url === "/v1/health") {
      res.end(JSON.stringify({ ready: true }));
      return;
    }
    if (req.url === "/v1/servers") {
      res.end(JSON.stringify({ servers: [{ players: 8 }] }));
      return;
    }
    if (req.url === "/v1/online/status") {
      const zero = { users: 0, guests: 0 };
      const counts = { online: { users: 2, guests: 1 }, idle: zero, queued: zero, joining: zero,
        playing: { users: 2, guests: 1 }, postgame: zero };
      res.end(JSON.stringify({ ...counts, updated_at: Math.floor(Date.now()/1000), activity_window_seconds: 30,
        playlists: [{ id: "ranked", name: "Ranked", ...counts }], private_ids: ["private-player"] }));
      return;
    }
    if (req.url === "/v1/history/players?discord_username=pilot") {
      res.end(JSON.stringify({ players: [player] }));
      return;
    }
    if (req.url === `/v1/history/players/${playerId}/profile`) {
      res.end(JSON.stringify(player));
      return;
    }
    if (req.url === `/v1/history/players/${playerId}/matches`) {
      res.end(JSON.stringify({ player, matches: [], next: null }));
      return;
    }
    if (req.url === `/v1/history/matches/${matchId}`) {
      res.end(JSON.stringify({ id: matchId, players: [player] }));
      return;
    }
    res.end(JSON.stringify({ players: [], query: req.url }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const masterPort = (upstream.address() as { port: number }).port;
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const child = spawn(process.execPath, ["scripts/bridge.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      MASTER_DATABASE: database,
      MASTER_INTERNAL_URL: `http://127.0.0.1:${masterPort}`,
      WEBSITE_ORIGINS: "https://halo2forever.net",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw new Error("Bridge failed to start");
      }),
    ]);
    const base = `http://127.0.0.1:${port}`;
    const population = await (await fetch(base + "/v1/website/status", {
      headers: { Authorization: "Bearer never-forward", Cookie: "never-forward=1" },
    })).json();
    assert.equal(population.online.online.users, 2);
    assert.equal(population.online.playlists[0].playing.guests, 1);
    assert.equal(population.players, 8);
    assert.ok(!JSON.stringify(population).includes("private-player"));
    const good = await fetch(
      base + "/v1/history/players?discord_username=alpha",
      {
        headers: {
          Origin: "https://halo2forever.net",
          Authorization: "Bearer test-never-forward",
          Cookie: "test-never-forward=1",
        },
      },
    );
    assert.equal(good.status, 200);
    assert.equal(
      good.headers.get("access-control-allow-origin"),
      "https://halo2forever.net",
    );
    assert.equal(good.headers.get("access-control-allow-credentials"), null);
    assert.deepEqual((await good.json()).players, []);
    const displaySearch = await fetch(base + "/v1/history/players?display_name=%20hAlO%20pI%20");
    assert.equal(displaySearch.status, 200);
    const found = await displaySearch.json();
    assert.equal(found.players[0].friend_tag, "Halo Pilot#00000001");
    const tagSearch = await (await fetch(base+"/v1/history/players?display_name="+encodeURIComponent("Halo Pilot#99999999"))).json();
    assert.equal(tagSearch.players.length, 1);
    assert.equal(tagSearch.players[0].id, "cccccccc-cccc-cccc-cccc-cccccccccccc");
    assert.deepEqual(found.players.map((player: { id: string }) => player.id), [
      playerId, "cccccccc-cccc-cccc-cccc-cccccccccccc",
    ]);
    assert.deepEqual(found.players.map((player: { steam_name: string }) => player.steam_name), [
      "Steam Pilot", "Other Steam Handle",
    ]);
    assert.deepEqual(found.players.map((player: { steam_profile_url: string }) => player.steam_profile_url), [
      "https://steamcommunity.com/profiles/76561198000000001",
      "https://steamcommunity.com/profiles/76561198000000002",
    ]);
    assert.ok(!JSON.stringify(found).includes("private-"));
    for (const query of [
      "display_name=", "display_name=%20%20", "display_name=%00",
      `display_name=${"a".repeat(65)}`,
      "display_name=Halo&display_name=Pilot", "display_name=Halo&discord_username=pilot",
      "display_name=Halo&unexpected=1",
    ]) {
      assert.equal((await fetch(base + "/v1/history/players?" + query)).status, 400, query);
    }
    for (const path of [
      "/v1/history/players?discord_username=pilot",
      `/v1/history/players/${playerId}/profile`,
      `/v1/history/players/${playerId}/matches`,
      `/v1/history/matches/${matchId}`,
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      const data = await response.json();
      const player = data.player ?? data.players?.[0] ?? data;
      assert.equal(player.screen_name, "Halo Pilot");
      assert.equal(player.steam_name, "Steam Pilot");
      assert.equal(player.steam_profile_url, "https://steamcommunity.com/profiles/76561198000000001");
      assert.ok(!JSON.stringify(data).includes("private-player"));
      assert.equal(player.subject, undefined);
    }
    const other = await fetch(
      base + "/v1/history/players?discord_username=alpha",
      { headers: { Origin: "https://untrusted.example" } },
    );
    assert.equal(other.headers.get("access-control-allow-origin"), null);
    for (const path of [
      "/v1/admin/credentials",
      "/v1/account/session",
      "/v1/account/eos-token",
      "/v1/friends",
      "/v1/friends/commands",
      "/v1/history/../friends",
      "/v1/history/%2e%2e/friends",
      "/h2friends-v1.json",
      "/v1/servers",
      "/v1/history/matches/not-a-public-alias",
    ])
      assert.equal((await fetch(base + path)).status, 404);
    assert.equal(
      (
        await fetch(base + "/v1/history/players", {
          method: "POST",
          body: "{}",
        })
      ).status,
      405,
    );
    assert.equal(
      (await fetch(base + "/v1/history/leaderboard?sort=toString")).status,
      404,
    );
  } finally {
    if(child.exitCode===null && child.signalCode===null){
      const exited=once(child,"exit");child.kill("SIGTERM");await exited;
    }
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
