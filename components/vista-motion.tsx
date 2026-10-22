"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { introKeyframes, loadingRingAnimation, vistaMotion, type VistaIntroTrack } from "@/lib/vista-motion";

const MotionContext = createContext({ enabled: false, ready: false, reduced: false, toggle: () => {} });
const preferenceKey = "halo2-motion-paused";
const ringLayers = [1, 2, 3].flatMap(index => [false, true].map(wide => ({
  wide, motion: loadingRingAnimation(index, wide),
})));

export function VistaMotionProvider({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    try { setPaused(localStorage.getItem(preferenceKey) === "true"); } catch { /* Storage is optional. */ }
    setReady(true);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const enabled = ready && !paused && !reduced;
  return (
    <MotionContext.Provider value={{ enabled, ready, reduced, toggle: () => {
      setPaused(!paused);
      try { localStorage.setItem(preferenceKey, String(!paused)); } catch { /* Storage is optional. */ }
    } }}>
      {children}
    </MotionContext.Provider>
  );
}

export function MotionToggle() {
  const { enabled, ready, reduced, toggle } = useContext(MotionContext);
  return (
    <button className="motion-toggle" type="button" onClick={toggle}
      disabled={!ready || reduced} aria-label={reduced ? "Animations disabled by reduced motion preference" : enabled ? "Pause animations" : "Resume animations"}
      title={reduced ? "Animations follow your reduced motion preference" : undefined}>
      {enabled ? <Pause size={13} /> : <Play size={13} />}
      <span>{enabled ? "Pause motion" : "Motion off"}</span>
    </button>
  );
}

/** Pause work when hidden or offscreen. No artificial loading progress. */
function useActive<T extends HTMLElement>(ref: React.RefObject<T | null>, once = false) {
  const { enabled } = useContext(MotionContext);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(([entry]) => setInView((before) => (once && before) || entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [ref, once]);
  return enabled && visible && inView;
}

export function VistaLoadingRings({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const animations = useRef<Animation[]>([]);
  const active = useActive(ref);
  useEffect(() => {
    const created = layers.current.flatMap((wrapper, layer) => {
      if (!wrapper) return [];
      const { motion } = ringLayers[layer];
      const startup = wrapper.animate(motion.startup.keyframes, {
        duration: motion.startup.duration, easing: motion.startup.easing, fill: "forwards",
      });
      const spin = wrapper.animate(motion.spin.keyframes, {
        delay: motion.spin.delay, duration: motion.spin.duration,
        iterations: Infinity, easing: "linear", fill: "forwards",
      });
      startup.onfinish = () => {
        startup.cancel();
        // Refresh after retiring the competing startup effect so the browser
        // can keep the continuous rotation entirely on the compositor.
        if (spin.effect instanceof KeyframeEffect) spin.effect.setKeyframes(motion.spin.keyframes);
      };
      for (const animation of [startup, spin]) {
        animation.pause();
        animation.currentTime = 0;
      }
      return [startup, spin];
    });
    animations.current = created;
    return () => { created.forEach(animation => animation.cancel()); animations.current = []; };
  }, []);
  useEffect(() => {
    for (const animation of animations.current) {
      // A completed startup must stay retired when motion resumes.
      if (animation.playState === "finished" || animation.playState === "idle") continue;
      if (active) animation.play();
      else animation.pause();
    }
  }, [active]);
  return (
    <div ref={ref} className={`vista-loading-rings ${className}`} aria-hidden="true" data-motion-active={active}>
      {ringLayers.map(({ wide, motion }, layer) => {
        return <div key={layer} ref={(node) => { layers.current[layer] = node; }} className="vista-ring-layer">
          <img className={wide ? "vista-ring-wide" : "vista-ring-thin"}
            src={`/vista/vista-loading-${wide ? "wide" : "thin"}-mechanical-ring.svg`} alt=""
            style={{ transform: motion.transform }} />
        </div>;
      })}
    </div>
  );
}

/** A source widget's intro plays once when it enters view, without hiding no-JS content. */
export function VistaIntro({ children, className, track, delay = 0, as: Tag = "div" }: {
  children: React.ReactNode;
  className?: string;
  track: VistaIntroTrack;
  delay?: number;
  as?: "div" | "tr";
}) {
  const ref = useRef<HTMLElement>(null);
  const active = useActive(ref, true);
  const played = useRef(false);
  useEffect(() => {
    if (!active || played.current || !ref.current) return;
    played.current = true;
    const animation = ref.current.animate(introKeyframes(track, window.innerWidth), {
      duration: vistaMotion.intro[track].ms, delay, easing: "linear", fill: "backwards",
    });
    // Cancel after the intro so a transform cannot trap tooltips or cover the foreground frame.
    animation.onfinish = () => animation.cancel();
    return () => animation.cancel();
  }, [active, track, delay]);
  return <Tag ref={(node: HTMLDivElement | HTMLTableRowElement | null) => { ref.current = node; }} className={className} data-vista-intro={track}>{children}</Tag>;
}
