import { test } from "node:test";
import assert from "node:assert/strict";
import { publicPopulation, statusService } from "../scripts/status-service.ts";

function fixture() {
  const zero = () => ({ users: 0, guests: 0 });
  const row = () => ({ online: { users: 4, guests: 1 }, idle: zero(),
    queued: { users: 2, guests: 1 }, joining: zero(), playing: { users: 2, guests: 0 }, postgame: zero() });
  return { ...row(), online: { users: 5, guests: 1 }, idle: { users: 1, guests: 0 },
    updated_at: Math.floor(Date.now() / 1000), activity_window_seconds: 30,
    playlists: [{ id: "ranked", name: "Ranked", ...row() }] };
}

test("population projection exposes aggregate fields only and validates partitions", () => {
  const expected = fixture();
  const raw = { ...expected, account_ids: ["private-account"], token: "private-token" };
  const value = publicPopulation(raw);
  assert.deepEqual(value, expected);
  assert.ok(!JSON.stringify(value).includes("private"));
  assert.throws(() => publicPopulation({ ...raw, online: { users: 500, guests: 1 } }));
  assert.throws(() => publicPopulation({ ...raw, queued: { users: -1, guests: 1 } }));
  assert.throws(() => publicPopulation({ ...raw, playlists: [...raw.playlists, ...raw.playlists] }));
});

test("status shares one fetch and keeps advertised occupancy separate from unique accounts", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (input, options) => {
    requests++;
    assert.equal(options?.redirect, "error");
    assert.equal(options?.headers, undefined);
    const path = new URL(String(input)).pathname;
    return Response.json(path === "/v1/health" ? { ready: true } : path === "/v1/servers"
      ? { servers: [{ players: 8 }, { players: 9 }] } : fixture());
  };
  const load = statusService("http://master.test", fetcher);
  const results = await Promise.all(Array.from({ length: 10 }, () => load()));
  await load();
  assert.equal(requests, 3);
  assert.equal(results[0].players, 17);
  assert.equal(results[0].online?.online.users, 5);
  assert.equal(results[0].matchmaking_players, 3);
  assert.equal(results[0].online?.playlists[0].queued.guests, 1);
});

test("an older or malformed master reports unknown population instead of zero", async () => {
  for (const population of [new Response("not found", { status: 404 }), Response.json({ users: 0 })]) {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      return path === "/v1/health" ? Response.json({ ready: true, matchmaking_players: 2 })
        : path === "/v1/servers" ? Response.json({ servers: [] }) : population;
    };
    const status = await statusService("http://master.test", fetcher)();
    assert.equal(status.online, null);
    assert.equal(status.matchmaking_players, 2);
  }
});
