"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import type { Player } from "@/lib/types";
import { profileAppearance, joinedDate } from "@/lib/profile-appearance";

export function PlayerAppearance({ player }: { player: Player }) {
  const appearance = useMemo(() => profileAppearance(player.appearance), [player.appearance]);
  const host = useRef<HTMLDivElement>(null);
  const model = useRef<Awaited<ReturnType<typeof import("@/lib/profile-renderer").mountPlayerModel>> | null>(null);
  const [emblem, setEmblem] = useState(""), [error, setError] = useState(""), [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setEmblem(""); setError(""); setReady(false);
    if (!appearance || !host.current) return;
    const element = host.current;
    import("@/lib/profile-renderer").then(async ({ mountPlayerModel, emblemImage }) => {
      await Promise.all([
        mountPlayerModel(element, appearance, controller.signal).then((mounted) => {
          if (controller.signal.aborted) { mounted.dispose(); return; }
          model.current = mounted; setReady(true);
        }),
        emblemImage(appearance, controller.signal).then((image) => { if (!controller.signal.aborted) setEmblem(image); }),
      ]);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); model.current?.dispose(); model.current = null; };
  }, [appearance]);
  const joined = joinedDate(player.joined_at);
  return <section className="profile-identity data-panel" aria-label="Player appearance and membership">
    <div className="profile-model-panel">
      <div className="panel-caption"><span>PLAYER MODEL</span><span className="muted">{appearance?.species.toUpperCase() ?? "NOT RECORDED"}</span></div>
      <div className="profile-model" ref={host} />
      {!ready && <p className="model-status">{appearance ? (error || "Loading player model…") : "This player has not saved an appearance yet."}</p>}
      {ready && <div className="model-controls">
        <button className="button secondary" aria-label="Rotate player model left" onClick={() => model.current?.rotate(.35)}><RotateCcw size={16}/></button>
        <button className="text-link" onClick={() => model.current?.reset()}>Reset view</button>
        <button className="button secondary" aria-label="Rotate player model right" onClick={() => model.current?.rotate(-.35)}><RotateCw size={16}/></button>
      </div>}
    </div>
    <div className="profile-identity-details">
      <p className="eyebrow">PLAYER EMBLEM</p>
      <div className="profile-selected-emblem">{emblem ? <img src={emblem} alt={`${player.screen_name}’s saved player emblem`} width={160} height={160}/> : <span className="muted">{appearance ? error || "Loading emblem…" : "Emblem not recorded"}</span>}</div>
      <dl>
        <div><dt>Service tag</dt><dd>{player.service_tag || "Not set"}</dd></div>
        <div><dt>Joined</dt><dd>{joined ?? "Not recorded"}</dd></div>
      </dl>
      {!joined && <p className="data-note">No join date was recorded for this account.</p>}
      {appearance && <div className="profile-color-swatches" aria-label="Saved player colors">{appearance.colors.map((color, i) => <span key={i} title={["Primary armor", "Secondary armor", "Primary emblem", "Secondary emblem"][i]} style={{ backgroundColor: `rgb(${color.map((v) => Math.round(v*255)).join(" ")})` }}/>)}</div>}
    </div>
  </section>;
}
