export interface PublicSkill {
  level: number;
  playlist: string;
  configuration: string;
}
export interface Player {
  skill?: PublicSkill | null;
  id: string;
  discord_username: string;
  steam_name?: string | null;
  steam_profile_url?: string | null;
  screen_name: string;
  friend_tag?: string | null;
  joined_at?: number | null;
  service_tag?: string | null;
  appearance?: {
    format: "halo2-profile-appearance-v1";
    bytes: string;
    species: "spartan" | "elite";
    colors: number[];
    emblem: { foreground: number; background: number; flags: number; reserved: number };
  } | null;
  statistics?: { matches: number; wins: number; kills: number; deaths: number; assists: number; shots: number; hits: number; accuracy_matches: number; accuracy_complete: boolean };
  statistics_source?: "eos";
  statistics_updated_at?: number;
}
export interface MatchSummary {
  id: string;
  completed: number;
  playlist: string;
  revision: string;
  map: string;
  variant: string;
  ranked: number;
  placement: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  suicides: number;
  format: string;
}
export interface MatchPage {
  player: Player;
  matches: MatchSummary[];
  next: string | null;
}
export interface ReportPlayer extends Omit<Player,"appearance"> {
  skill_at_match?: PublicSkill | null;
  screen_name_at_match: string | null;
  discord_username_at_match: string | null;
  slot: number | null;
  appearance: string | null;
  placement: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  suicides: number;
  team: number | null;
  individual_placement: number | null;
  details_available: boolean;
  general: number[][];
  medals: number[][];
  weapons: number[][];
  opponents: { player: string; values: number[] }[];
}
export interface Report extends Omit<
  MatchSummary,
  "placement" | "score" | "kills" | "deaths" | "assists" | "suicides"
> {
  validation: string;
  admitted_at: number | null;
  admitted_players: number | null;
  published_players: number;
  variant_bytes: string | null;
  guest_details: string;
  players: ReportPlayer[];
  teams: {
    team: number;
    placement: number;
    score: number;
    general: number[][];
  }[];
}
export interface Leader extends Player {
  position: number;
  score: number;
}
export interface Leaderboard {
  players: Leader[];
  playlist: string;
  metric: "kills" | "level";
  source: "eos";
  updated_at: number;
}
export interface ServiceStatus {
  matchmaking_players: number | null;
  online: OnlinePopulation | null;
  ready: boolean;
  servers: number;
  players: number;
}
export interface PopulationCount {
  users: number;
  guests: number;
}
export interface PopulationStates {
  online: PopulationCount;
  idle: PopulationCount;
  queued: PopulationCount;
  joining: PopulationCount;
  playing: PopulationCount;
  postgame: PopulationCount;
}
export interface OnlinePopulation extends PopulationStates {
  updated_at: number;
  activity_window_seconds: number;
  playlists: (PopulationStates & { id: string; name: string })[];
}
