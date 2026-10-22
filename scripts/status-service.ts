import type { OnlinePopulation, PopulationStates, ServiceStatus } from "../lib/types.ts";

const states = ["online", "idle", "queued", "joining", "playing", "postgame"] as const;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid service status");
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1000000)
    throw new Error("Invalid population count");
  return value;
}
function counters(value: unknown): PopulationStates {
  const row = object(value);
  const result = {} as PopulationStates;
  for (const state of states) {
    const pair = object(row[state]);
    result[state] = { users: count(pair.users), guests: count(pair.guests) };
  }
  for (const kind of ["users", "guests"] as const)
    if (states.slice(1).reduce((sum, state) => sum + result[state][kind], 0) !== result.online[kind])
      throw new Error("Inconsistent population counts");
  return result;
}
/** Project aggregate fields explicitly; an upstream roster can never leak here. */
export function publicPopulation(value: unknown): OnlinePopulation {
  const row = object(value);
  if (!Array.isArray(row.playlists) || row.playlists.length > 64) throw new Error("Invalid playlists");
  if (typeof row.updated_at !== "number" || !Number.isSafeInteger(row.updated_at) || row.updated_at <= 0)
    throw new Error("Invalid population timestamp");
  const window = count(row.activity_window_seconds);
  if (!window || window > 300) throw new Error("Invalid activity window");
  const playlists = row.playlists.map((value) => {
    const entry = object(value);
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id) ||
        typeof entry.name !== "string" || !entry.name.length || entry.name.length > 128)
      throw new Error("Invalid playlist");
    return { id: entry.id, name: entry.name, ...counters(entry) };
  });
  if (new Set(playlists.map((p) => p.id)).size !== playlists.length) throw new Error("Duplicate playlist");
  return { ...counters(row), updated_at: row.updated_at, activity_window_seconds: window, playlists };
}

/** Share one five-second request across browsers; never add advertised seats to accounts. */
export function statusService(master: string, fetcher: typeof fetch = fetch) {
  let cache: { until: number; value: ServiceStatus } | undefined;
  let pending: Promise<ServiceStatus> | undefined;
  async function load(): Promise<ServiceStatus> {
    const [healthResponse, serversResponse, onlineResponse] = await Promise.all(
      ["/v1/health", "/v1/servers", "/v1/online/status"].map((path) =>
        fetcher(master + path, { signal: AbortSignal.timeout(8000), redirect: "error" })
          .catch(() => null)),
    );
    if (!healthResponse?.ok || !serversResponse?.ok) throw new Error("Master unavailable");
    const health = object(await healthResponse.json());
    const servers = object(await serversResponse.json()).servers;
    if (typeof health.ready !== "boolean" || !Array.isArray(servers)) throw new Error("Invalid master status");
    let online: OnlinePopulation | null = null;
    try {
      if (onlineResponse?.ok) online = publicPopulation(await onlineResponse.json());
    } catch { /* An older/unavailable counter is unknown, never a fabricated zero. */ }
    return {
      ready: health.ready, online,
      matchmaking_players: online
        ? online.queued.users + online.queued.guests + online.joining.users + online.joining.guests
        : Number.isSafeInteger(health.matchmaking_players) && Number(health.matchmaking_players) >= 0
          ? Number(health.matchmaking_players) : null,
      servers: servers.length,
      players: servers.reduce((sum, server) => sum + count(object(server).players), 0),
    };
  }
  return async (): Promise<ServiceStatus> => {
    if (cache && cache.until > Date.now()) return cache.value;
    if (!pending) pending = load().then((value) => {
      cache = { value, until: Date.now() + 5000 };
      return value;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
