"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Shield } from "lucide-react";

const acknowledgementKey = "halo2-fan-project-acknowledged-v1";

export function FirstVisitNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(acknowledgementKey) === "true") return;
    } catch {
      // Visitors can still acknowledge the notice when browser storage is unavailable.
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;

    // Native modal behavior traps focus and makes the rest of the page inert.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    element.showModal();

    return () => {
      element.close();
      root.style.overflow = previousOverflow;
    };
  }, [open]);

  function agree() {
    try {
      localStorage.setItem(acknowledgementKey, "true");
    } catch {
      // The acknowledgement still lasts for this visit without persistent storage.
    }
    setOpen(false);
  }

  return (
    <dialog
      ref={dialog}
      className="fan-notice"
      aria-labelledby="fan-notice-title"
      aria-describedby="fan-notice-description"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="fan-notice-content">
        <img
          className="fan-notice-frame"
          src="/vista/overview-frame.svg"
          alt=""
          aria-hidden="true"
        />
        <div className="fan-notice-header">
          <img src="/vista/halo2-title-wordmark.svg" alt="Halo 2" />
          <span>FOREVER / PROJECT NOTICE</span>
        </div>
        <p className="fan-notice-eyebrow">
          <Shield size={16} aria-hidden="true" /> INDEPENDENT. COMMUNITY MADE.
        </p>
        <h2 id="fan-notice-title">Welcome to a fan project.</h2>
        <div id="fan-notice-description" className="fan-notice-description">
          <p>
            Halo 2 Forever is an unofficial, community-made fan project. It is
            not affiliated with, endorsed by, or sponsored by Microsoft, Halo
            Studios, or Bungie.
          </p>
          <p>
            Halo and all related names, characters, and trademarks belong to
            their respective owners.
          </p>
        </div>
        <div className="fan-notice-actions">
          <p>By selecting Agree, you acknowledge that this is an unofficial fan project.</p>
          <button className="button primary" type="button" onClick={agree}>
            <Check size={18} aria-hidden="true" /> Agree and continue
          </button>
        </div>
      </div>
    </dialog>
  );
}
