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
  db.close();
  const upstream = createServer((req, res) => {
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    res.setHeader("Content-Type", "application/json");
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
    const other = await fetch(
      base + "/v1/history/players?discord_username=alpha",
      { headers: { Origin: "https://untrusted.example" } },
    );
    assert.equal(other.headers.get("access-control-allow-origin"), null);
    for (const path of [
      "/v1/admin/credentials",
      "/v1/account/session",
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
      400,
    );
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
