"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import type { Player } from "@/lib/types";
import { profileAppearance } from "@/lib/profile-appearance";

export function PlayerEmblem({ player }: { player: Player }) {
  const appearance = useMemo(() => profileAppearance(player.appearance), [player.appearance]);
  const [image, setImage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setImage("");
    if (appearance) import("@/lib/profile-renderer").then(({ emblemImage }) => emblemImage(appearance, controller.signal))
      .then((value) => { if (!controller.signal.aborted) setImage(value); }).catch(() => {});
    return () => controller.abort();
  }, [appearance]);
  return <span className="profile-avatar">{image
    ? <img src={image} alt={`${player.screen_name}’s saved emblem`} width={76} height={76}/>
    : <span aria-label={appearance ? "Loading player emblem" : "Player emblem not recorded"}>—</span>}</span>;
}

export function PlayerAppearance({ player }: { player: Player }) {
  const appearance = useMemo(() => profileAppearance(player.appearance), [player.appearance]);
  const host = useRef<HTMLDivElement>(null);
  const model = useRef<Awaited<ReturnType<typeof import("@/lib/profile-renderer").mountPlayerModel>> | null>(null);
  const [error, setError] = useState(""), [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setReady(false);
    if (!appearance || !host.current) return;
    const element = host.current;
    import("@/lib/profile-renderer").then(async ({ mountPlayerModel }) => {
      await mountPlayerModel(element, appearance, controller.signal).then((mounted) => {
          if (controller.signal.aborted) { mounted.dispose(); return; }
          model.current = mounted; setReady(true);
        });
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); model.current?.dispose(); model.current = null; };
  }, [appearance]);
  return <section className={`profile-identity data-panel${error || !appearance ? " model-unavailable" : ""}`} aria-label="Player model">
    <div className="profile-model-panel">
      <div className="profile-model" ref={host} />
      {!ready && <p className="model-status">{appearance ? (error || "Loading player model…") : "This player has not saved an appearance yet."}</p>}
      {ready && <p className="model-interaction-hint" id="model-interaction-hint">Drag to rotate <span aria-hidden="true">↔</span></p>}
    </div>
  </section>;
}
