import data from "./vista-motion-data.json" with { type: "json" };

export const vistaMotion = data;
export type VistaIntroTrack = keyof typeof data.intro;

/** Native 66A512 / 66A0E2 loading rotation, adapted to a square browser canvas.
 * The original has three pairs of texture 3 (thin) / 4 (wide), not one spinner.
 * Float constants are the original PE words; browser trig is not x87 bit exact.
 * Size stays at the initial diameter; the website omits the source breathing effect.
 */
export function loadingRingPose(seconds: number, index: number, wide: boolean) {
  const f = Math.fround;
  const t = f(seconds);
  const threshold = index * 0.5 + 1;
  const rotation = t < threshold
    ? f((t / threshold) ** 2 * threshold * f(1.3))
    : f(f(1.3) * t);
  const angle = f(f(f(rotation * f(wide ? -0.20943951606750488 : 0.12566371262073517)) * index) * f(1.1));
  const size = f(0.936 / index);
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

/** Browser-owned rotation with the same quadratic startup and reflected UVs. */
export function loadingRingAnimation(index: number, wide: boolean) {
  const threshold = index * 0.5 + 1;
  const { size, angle } = loadingRingPose(threshold, index, wide);
  const velocity = Math.fround(1.3) * Math.fround(wide ? -0.20943951606750488 : 0.12566371262073517) * index * Math.fround(1.1);
  return {
    transform: `matrix(0,${size},${size},0,0,0)`,
    startup: {
      keyframes: [{ rotate: "0rad" }, { rotate: `${angle}rad` }],
      duration: threshold * 1000,
      // x(t) = t and y(t) = t², preserving the original acceleration.
      easing: "cubic-bezier(0.3333333333333333,0,0.6666666666666666,0.3333333333333333)",
    },
    spin: {
      keyframes: [{ rotate: `${angle}rad` }, { rotate: `${angle + Math.sign(velocity) * 2 * Math.PI}rad` }],
      delay: threshold * 1000,
      duration: 2 * Math.PI / Math.abs(velocity) * 1000,
    },
  };
}

/** Original 640px menu coordinate system scales to the responsive viewport. */
export function introKeyframes(track: VistaIntroTrack, viewportWidth: number) {
  return data.intro[track].keys.map((key) => ({
    opacity: key.alpha,
    transform: `translate(${key.x * viewportWidth / 640}px,${-key.y * viewportWidth / 640}px)`,
  }));
}
