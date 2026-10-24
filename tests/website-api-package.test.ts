import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

test("production website image ships every module needed for display-name search", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "halo2-website-package-"));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const app = join(directory, "app");
    const dockerfile = await readFile("backend/eos-worker/Dockerfile", "utf8");
    const stage = dockerfile.split("FROM runtime AS website-api\n")[1].split(/^FROM /m)[0];
    // Exercise the actual shipped file set in isolation. Starting from the
    // checkout masks missing COPY inputs because those imports exist there.
    for (const match of stage.matchAll(/^COPY (.+) (\S+)$/gm)) {
      const destination = join(app, match[2]);
      await mkdir(destination, { recursive: true });
      for (const source of match[1].split(/\s+/)) {
        await copyFile(source, join(destination, basename(source)));
      }
    }
    const database = join(directory, "registry.sqlite3");
    const db = new DatabaseSync(database);
    db.exec(`
      CREATE TABLE history_players(player TEXT,public_id TEXT);
      CREATE TABLE player_profiles(player TEXT,screen_name TEXT,discord_username TEXT,steam_name TEXT);
      CREATE TABLE player_identities(player TEXT,provider TEXT,subject TEXT);
      CREATE TABLE playlist_skill(player TEXT,playlist TEXT,configuration TEXT,raw_rank INTEGER);
      CREATE TABLE match_results(id TEXT,playlist TEXT,ranked INTEGER);
      CREATE TABLE match_result_players(match TEXT,player TEXT);
      INSERT INTO history_players VALUES('private-test','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
      INSERT INTO player_profiles VALUES('private-test','Test Display Name','','Test Steam Handle');
      INSERT INTO player_identities VALUES('private-test','steam','76561198000000001');
    `);
    db.close();
    const reserve = createServer();
    reserve.listen(0, "127.0.0.1");
    await once(reserve, "listening");
    const port = (reserve.address() as { port: number }).port;
    await new Promise<void>((resolve) => reserve.close(() => resolve()));
    child = spawn(process.execPath, ["scripts/bridge.ts"], {
      cwd: app,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", MASTER_DATABASE: database,
        MASTER_INTERNAL_URL: "http://127.0.0.1:1", H2_EOS_WORKER: "", H2_EOS_WEB_STATE: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let errors = "";
    child.stderr!.on("data", (chunk) => { errors = (errors + chunk).slice(-8000); });
    await Promise.race([
      once(child.stdout!, "data"),
      once(child, "exit").then(([code]) => { throw new Error(`Packaged API exited (${code}): ${errors}`); }),
    ]);
    const response = await fetch(`http://127.0.0.1:${port}/v1/history/players?display_name=display%20name`, {
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 200);
    const { players } = await response.json();
    assert.equal(players.length, 1);
    assert.equal(players[0].screen_name, "Test Display Name");
    assert.equal(players[0].steam_name, "Test Steam Handle");
    assert.equal(players[0].steam_profile_url, "https://steamcommunity.com/profiles/76561198000000001");
    assert.ok(!JSON.stringify(players).includes("private-test"));
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
