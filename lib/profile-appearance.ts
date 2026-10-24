import palette from "../public/profile/palette.json" with { type: "json" };
import type { Player } from "./types";

export function profileAppearance(value: Player["appearance"]) {
  if (!value || value.format !== "halo2-profile-appearance-v1" || !/^[a-f0-9]{18}$/i.test(value.bytes)) return null;
  const bytes = value.bytes.match(/../g)!.map((word) => parseInt(word, 16));
  if (bytes[4] > 1) return null;
  const colors = bytes.slice(0, 4).map((index) => palette[index] ?? [1, 1, 1]);
  return { bytes: value.bytes, species: bytes[4] === 1 ? "elite" as const : "spartan" as const,
    colors, foreground: Math.min(bytes[5], 63), background: Math.min(bytes[6], 31), flags: bytes[7] };
}
export type ProfileAppearance = NonNullable<ReturnType<typeof profileAppearance>>;

export function joinedDate(timestamp: number | null | undefined): string | null {
  if (timestamp == null || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8640000000000) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(timestamp * 1000));
}
