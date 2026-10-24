import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { currentSkill, skillsAtMatch } from "./public-ranks.ts";
import { eosEnvironment } from "./eos-service.ts";
import { publicSteam } from "./public-steam.ts";
import { statusService } from "./status-service.ts";
import { RequestBudgets } from "./request-budgets.ts";
import { createPlayerSearch } from "./player-search.ts";
import { displayNameQuery } from "../lib/player-search.ts";
const port = Number(process.env.PORT ?? 8090);
const master = process.env.MASTER_INTERNAL_URL ?? "http://directory:8080";
const serviceStatus = statusService(master);
const db = new DatabaseSync(
  process.env.MASTER_DATABASE ?? "/state/registry.sqlite3",
  { readOnly: true },
);
db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=3000;");
const searchPlayers = createPlayerSearch(db);
const eos=eosEnvironment(db);
eos?.start();
const origins = new Set(
  (
    process.env.WEBSITE_ORIGINS ??
    "https://halo2forever.net,https://www.halo2forever.net"
  ).split(","),
);
const budgets = new RequestBudgets();
const publicHistory =
  /^\/v1\/history\/(players|players\/[a-f0-9-]{36}\/(matches|profile)|matches\/[a-f0-9-]{36})$/;
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
  const admission = budgets.consume(key, now);
  if (admission === 503) {
    reply(503, { error: "Service busy" });
    return;
  }
  if (admission === 429) {
    res.setHeader("Retry-After", "60");
    reply(429, { error: "Rate limited" });
    return;
  }
  try {
    const url = new URL(req.url!, "http://website-api");
    if(url.pathname==="/v1/history/top25") {
      if(!url.search){reply(200,{playlists:eos?.boards.map(b=>b.playlist)??[]});return;}
      if([...url.searchParams.keys()].some(k=>k!=="playlist")||url.searchParams.getAll("playlist").length!==1){reply(400,{error:"Choose one playlist"});return;}
      const board=eos?.top(url.searchParams.get("playlist")!);
      if (board) for (const player of board.players)
        Object.assign(player, publicSteam(db, String(player.id)));
      reply(board?200:503,board??{error:"EOS standings are not available yet"});return;
    }
    if (url.pathname === "/v1/website/status" && !url.search) {
      reply(200, await serviceStatus());
      return;
    }
    if (!publicHistory.test(url.pathname) || url.search.length > 1000) {
      reply(404, { error: "Not found" });
      return;
    }
    if (url.pathname === "/v1/history/players" && url.searchParams.has("display_name")) {
      const name = displayNameQuery(url.searchParams.get("display_name")!);
      if (!name || [...url.searchParams.keys()].some((key) => key !== "display_name") ||
          url.searchParams.getAll("display_name").length !== 1) {
        reply(400, { error: "Enter a display name using 1–64 characters" });
        return;
      }
      const players = searchPlayers(name).map((player) => ({
        ...player,
        skill: currentSkill(db, String(player.id)),
        ...publicSteam(db, String(player.id)),
      }));
      reply(200, { players });
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
          for (const player of data.players) {
            player.skill = currentSkill(db, player.id);
            Object.assign(player, publicSteam(db, player.id));
          }
        else if(url.pathname.endsWith("/profile")) {
          Object.assign(data, publicSteam(db, data.id));
          eos?.enrich(data);
        }
        else if (url.pathname.includes("/players/")) {
          data.player.skill = currentSkill(db, data.player.id);
          Object.assign(data.player, publicSteam(db, data.player.id));
          eos?.enrich(data.player);
        }
        else {
          const ranks = skillsAtMatch(db, data.id);
          for (const player of data.players) {
            player.skill_at_match = ranks.get(player.id) ?? null;
            Object.assign(player, publicSteam(db, player.id));
          }
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
      eos?.close();
      db.close();
      process.exit(0);
    }),
  );
