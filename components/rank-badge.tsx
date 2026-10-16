import type { PublicSkill } from "@/lib/types";
import { label } from "@/lib/api";
const names: Record<number, string> = {
  44: "Moon",
  45: "Moon",
  46: "Moon",
  47: "Sun",
  48: "Sun",
  49: "Comet",
  50: "Halo ring",
};
export function RankBadge({
  skill,
  large = false,
}: {
  skill?: PublicSkill | null;
  large?: boolean;
}) {
  if (
    !skill ||
    !Number.isInteger(skill.level) ||
    skill.level < 1 ||
    skill.level > 50
  )
    return (
      <span
        className="rank-unavailable"
        title="No public ranked skill recorded"
      >
        —
      </span>
    );
  const name = names[skill.level] ?? `Level ${skill.level}`;
  return (
    <span
      className={`rank-badge ${large ? "rank-large" : ""}`}
      title={`${label(skill.playlist)} · Level ${skill.level} · ${skill.configuration}`}
    >
      <img
        src={`/vista/ranks/level-${skill.level}.svg`}
        alt={`${name} rank, level ${skill.level}`}
      />
      <span>
        LVL {skill.level}
        <small>{label(skill.playlist)}</small>
      </span>
    </span>
  );
}
