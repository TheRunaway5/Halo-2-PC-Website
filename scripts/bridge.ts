import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { currentSkill, skillsAtMatch } from "./public-ranks.ts";
import { leaderboard } from "./leaderboard-store.ts";
const port = Number(process.env.PORT ?? 8090);
const master = process.env.MASTER_INTERNAL_URL ?? "http://directory:8080";
const db = new DatabaseSync(
  process.env.MASTER_DATABASE ?? "/state/registry.sqlite3",
  { readOnly: true },
);
db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=3000;");
const origins = new Set(
  (
    process.env.WEBSITE_ORIGINS ??
    "https://halo2forever.net,https://www.halo2forever.net"
  ).split(","),
);
const budgets = new Map<string, { reset: number; count: number }>();
const publicHistory =
  /^\/v1\/history\/(players|players\/[a-f0-9-]{36}\/matches|matches\/[a-f0-9-]{36})$/;
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  if (origin && origins.has(origin))
    res.setHeader("Access-Control-Allow-Origin", origin);
  function reply(status: number, data: unknown) {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    reply(405, { error: "Read-only service" });
    return;
  }
  const now = Date.now();
  const client = req.socket.remoteAddress ?? "unknown";
  // Caddy supplies the real client address on the private Docker network only.
  const key =
    process.env.TRUST_PROXY === "1"
      ? String(req.headers["x-forwarded-for"] ?? client)
          .split(",")[0]
          .trim()
      : client;
  if (budgets.size > 10000)
    for (const [k, b] of budgets) if (b.reset < now) budgets.delete(k);
  let budget = budgets.get(key);
  if (!budget || budget.reset < now) {
    if (budgets.size >= 10000 && !budget) {
      reply(503, { error: "Service busy" });
      return;
    }
    budget = { reset: now + 60000, count: 0 };
    budgets.set(key, budget);
  }
  if (++budget.count > 90) {
    res.setHeader("Retry-After", "60");
    reply(429, { error: "Rate limited" });
    return;
  }
  try {
    const url = new URL(req.url!, "http://website-api");
    if (url.pathname === "/v1/history/leaderboard") {
      try {
        reply(200, leaderboard(db, url.searchParams));
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Invalid"))
          reply(400, { error: error.message });
        else throw error;
      }
      return;
    }
    if (url.pathname === "/v1/website/status" && !url.search) {
      const responses = await Promise.all(
        ["/v1/health", "/v1/servers"].map((path) =>
          fetch(master + path, {
            signal: AbortSignal.timeout(8000),
            redirect: "error",
          }),
        ),
      );
      if (responses.some((r) => !r.ok)) {
        reply(502, { error: "Master unavailable" });
        return;
      }
      const [health, list] = (await Promise.all(
        responses.map((r) => r.json()),
      )) as [
        { ready: boolean; matchmaking_players?: number },
        { servers: { players: number }[] },
      ];
      reply(200, {
        ready: health.ready,
        matchmaking_players: Number.isInteger(health.matchmaking_players)
          ? health.matchmaking_players
          : null,
        servers: list.servers.length,
        players: list.servers.reduce((n, s) => n + s.players, 0),
      });
      return;
    }
    if (!publicHistory.test(url.pathname) || url.search.length > 1000) {
      reply(404, { error: "Not found" });
      return;
    }
    // Fixed origin and allowlisted public GET paths only: no auth forwarding,
    // cookies, private endpoints, arbitrary URLs or redirects.
    const upstream = await fetch(master + url.pathname + url.search, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (upstream.headers.get("content-type")?.includes("application/json")) {
      const data = await upstream.json();
      if (upstream.ok) {
        if (url.pathname === "/v1/history/players")
          for (const player of data.players)
            player.skill = currentSkill(db, player.id);
        else if (url.pathname.includes("/players/"))
          data.player.skill = currentSkill(db, data.player.id);
        else {
          const ranks = skillsAtMatch(db, data.id);
          for (const player of data.players)
            player.skill_at_match = ranks.get(player.id) ?? null;
        }
      }
      reply(upstream.status, data);
    } else reply(502, { error: "Master unavailable" });
  } catch {
    reply(503, { error: "Service temporarily unavailable" });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxHeadersCount = 30;
server.listen(port, process.env.HOST ?? "0.0.0.0", () =>
  console.log(`Read-only website API listening on ${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
