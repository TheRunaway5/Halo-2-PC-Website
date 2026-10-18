import data from "./vista-motion-data.json" with { type: "json" };

export const vistaMotion = data;
export type VistaIntroTrack = keyof typeof data.intro;

/** Native 66A512 / 66A0E2 loading geometry, adapted to a square browser canvas.
 * The original has three pairs of texture 3 (thin) / 4 (wide), not one spinner.
 * Float constants are the original PE words; browser trig is not x87 bit exact.
 */
export function loadingRingPose(seconds: number, index: number, wide: boolean) {
  const f = Math.fround;
  const t = f(seconds);
  const threshold = index * 0.5 + 1;
  const rotation = t < threshold
    ? f((t / threshold) ** 2 * threshold * f(1.3))
    : f(f(1.3) * t);
  const angle = f(f(f(rotation * f(wide ? -0.20943951606750488 : 0.12566371262073517)) * index) * f(1.1));
  const size = f(((Math.sin(t / 15 * f(2 * Math.PI)) + 1) * 0.5 * (f(1.6) - 1) + 1) * 0.7199999690055847 / index);
  // Invert the original rotated UV mapping, including its initial diagonal reflection.
  const sine = Math.sin(angle), cosine = Math.cos(angle);
  return {
    size,
    angle,
    matrix: [-sine * size, cosine * size, cosine * size, sine * size] as const,
  };
}

export function loadingRingTransform(seconds: number, index: number, wide: boolean) {
  return `matrix(${loadingRingPose(seconds, index, wide).matrix.join(",")},0,0)`;
}

/** Original 640px menu coordinate system scales to the responsive viewport. */
export function introKeyframes(track: VistaIntroTrack, viewportWidth: number) {
  return data.intro[track].keys.map((key) => ({
    opacity: key.alpha,
    transform: `translate(${key.x * viewportWidth / 640}px,${-key.y * viewportWidth / 640}px)`,
  }));
}
