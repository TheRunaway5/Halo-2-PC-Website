import type { Player } from "./types.ts";
import { formatCount } from "./format-count.ts";

export function shotAccuracy(stats: NonNullable<Player["statistics"]>) {
  const known = stats.accuracy_matches > 0 &&
    Number.isSafeInteger(stats.shots) && stats.shots >= 0 &&
    Number.isSafeInteger(stats.hits) && stats.hits >= 0;
  const count = (value: number, singular: string, plural = `${singular}s`) =>
    `${formatCount(value)} ${value === 1 ? singular : plural}`;
  const misses = stats.shots - stats.hits;
  return {
    value: known && stats.shots > 0 ? `${(100 * stats.hits / stats.shots).toFixed(1)}%` : "—",
    tooltip: known ? `${count(stats.hits, "hit")} · ${misses >= 0 ? count(misses, "miss", "misses") : "Misses not recorded"} · ${count(stats.shots, "shot")}` : null,
    coverage: !stats.accuracy_complete && stats.matches > 0
      ? `Accuracy covers ${stats.accuracy_matches} of ${stats.matches} recorded matches.` : null,
  };
}
