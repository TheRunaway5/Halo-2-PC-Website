export interface PublicSkill {
  level: number;
  playlist: string;
  configuration: string;
}
export interface Player {
  skill?: PublicSkill | null;
  id: string;
  discord_username: string;
  screen_name: string;
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
export interface ReportPlayer extends Player {
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
export type Sort = "kills" | "wins" | "games" | "kd";
export interface Leader extends Player {
  position: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
}
export interface Leaderboard {
  players: Leader[];
  total: number;
  next: number | null;
  sort: Sort;
  playlists: string[];
  updated_at: number;
}
export interface ServiceStatus {
  matchmaking_players: number | null;
  ready: boolean;
  servers: number;
  players: number;
}
