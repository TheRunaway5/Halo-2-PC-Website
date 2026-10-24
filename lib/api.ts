import type {
  Leaderboard,
  MatchPage,
  Player,
  Report,
  ServiceStatus,
} from "./types";
const base = (
  process.env.NEXT_PUBLIC_MASTER_API_URL ||
  "https://master.halo2forever.net/website"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      signal: AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(12000),
      ]),
      credentials: "omit",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "The master server could not be reached. Please try again shortly.",
      0,
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status === 404
        ? "This record could not be found."
        : response.status === 429
          ? "Too many requests. Please wait a minute and try again."
          : "The master server is temporarily unavailable. Please try again.",
      response.status,
    );
  return response.json() as Promise<T>;
}
export const api = {
  status: (signal?: AbortSignal) =>
    get<ServiceStatus>("/v1/website/status", signal),
  search: (displayName: string, signal?: AbortSignal) =>
    get<{ players: Player[] }>(
      `/v1/history/players?display_name=${encodeURIComponent(displayName)}`,
      signal,
    ),
  matches: (id: string, before?: string, signal?: AbortSignal) =>
    get<MatchPage>(
      `/v1/history/players/${encodeURIComponent(id)}/matches?limit=20${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      signal,
    ),
  report: (id: string, signal?: AbortSignal) =>
    get<Report>(`/v1/history/matches/${encodeURIComponent(id)}`, signal),
  playlists: (signal?: AbortSignal) => get<{playlists:string[]}>("/v1/history/top25",signal),
  leaders: (playlist: string, signal?: AbortSignal) =>
    get<Leaderboard>(
      `/v1/history/top25?playlist=${encodeURIComponent(playlist)}`,
      signal,
    ),
};
export function label(value: string): string {
  return value
    .split(/[\\/]/)
    .pop()!
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
export function date(value: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value * 1000));
}
export function ratio(kills: number, deaths: number): string {
  return deaths === 0 ? (kills > 0 ? "∞" : "—") : (kills / deaths).toFixed(2);
}
export const playerLink = (id: string) =>
  `/players/?id=${encodeURIComponent(id)}`;
export const reportLink = (id: string) =>
  `/carnage/?id=${encodeURIComponent(id)}`;
