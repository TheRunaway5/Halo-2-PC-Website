import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  Crosshair,
  Monitor,
  Radio,
  ScanLine,
  Shield,
} from "lucide-react";
import { Status } from "@/components/status";
import { sourceUrl } from "@/components/ui";
import { VistaIntro, VistaLoadingRings } from "@/components/vista-motion";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-orbit" aria-hidden="true">
          <VistaLoadingRings className="orbit-rings" />
          <div className="orbit-core" />
          <span className="orbit-coordinate">
            INSTALLATION 05 / SYSTEM ACTIVE
          </span>
        </div>
        <div className="hero-content">
          <p className="eyebrow">
            <span className="tiny-cross">✦</span> THE NEXT CHAPTER OF A CLASSIC
          </p>
          <VistaIntro className="hero-logo" track="wordmark">
            <img src="/vista/halo2-title-wordmark.svg" alt="Halo 2" />
            <span>F O R E V E R</span>
          </VistaIntro>
          <h1>
            A classic.
            <br />
            <em>A new future.</em>
          </h1>
          <p className="hero-description">
            An independent effort to bring Halo 2 to modern PCs. Original Xbox
            gameplay at heart. A native foundation for the road ahead.
          </p>
          <div className="hero-actions">
            <a
              className="button primary"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Explore the project <ArrowUpRight size={18} />
            </a>
            <Link className="button secondary" href="/players/">
              Find your service record <ArrowRight size={18} />
            </Link>
          </div>
          <div className="development-note">
            <span /> IN DEVELOPMENT <i /> Open source. Community driven.
          </div>
        </div>
        <div className="hero-bottom">
          <span>REBUILDING THE LEGACY</span>
          <a href="#project">SCROLL TO EXPLORE ↓</a>
          <span>01 — 05</span>
        </div>
      </section>
      <div className="page-width">
        <Status />
        <section id="project" className="project-section">
          <div className="project-intro">
            <p className="eyebrow">01 / THE PROJECT</p>
            <h2>
              Same ring.
              <br />
              New possibilities.
            </h2>
            <p>
              Halo 2 Forever is a native C++20 port built around SDL2 and
              Vulkan. The goal is to preserve the gameplay and visual identity
              of the original Xbox TU1.5 experience, while building for modern
              hardware.
            </p>
            <p>
              The work is open and ongoing. Explore the source, follow
              development, and help shape what comes next.
            </p>
            <a
              href={`${sourceUrl}#progress-at-a-glance`}
              className="text-link"
              target="_blank"
              rel="noreferrer"
            >
              Follow development <ArrowUpRight size={16} />
            </a>
          </div>
          <VistaIntro className="systems-panel" track="panel">
            <img
              className="overview-frame"
              src="/vista/overview-frame.svg"
              alt=""
              aria-hidden="true"
            />
            <div className="panel-caption">
              <ScanLine size={16} />
              <span>PROJECT OVERVIEW</span>
              <span className="muted">NATIVE / PC</span>
            </div>
            {[
              {
                icon: Monitor,
                n: "01",
                title: "A native foundation",
                text: "C++20, SDL2 input and Vulkan rendering. Built to run directly on the desktop.",
              },
              {
                icon: Crosshair,
                n: "02",
                title: "The original experience",
                text: "Xbox TU1.5 is the gameplay and visual reference. Preservation guides the work.",
              },
              {
                icon: Radio,
                n: "03",
                title: "Connected by community",
                text: "Master server discovery, matchmaking components, and persistent match records.",
              },
            ].map((x) => (
              <div className="system-row" key={x.n}>
                <x.icon size={24} />
                <div>
                  <h3>{x.title}</h3>
                  <p>{x.text}</p>
                </div>
                <span>{x.n}</span>
              </div>
            ))}
          </VistaIntro>
        </section>
        <section className="records-section">
          <div className="records-heading">
            <p className="eyebrow">02 / YOUR LEGACY, RECORDED</p>
            <h2>Every match tells a story.</h2>
            <p>
              Follow the community leaderboard or look up a player’s recorded
              matches.
              <br />
              The carnage report is just the beginning.
            </p>
          </div>
          <VistaIntro className="record-links" track="frame">
            <Link href="/leaderboard/" className="record-link">
              <div className="record-icon">
                <Shield size={30} />
              </div>
              <div>
                <p className="eyebrow">COMMUNITY STANDINGS</p>
                <h3>See who’s leading.</h3>
                <p>
                  Explore all-time combat statistics from the master server’s
                  recorded matches.
                </p>
              </div>
              <ArrowUpRight size={26} />
              <span className="record-index">01</span>
            </Link>
            <Link href="/players/" className="record-link">
              <div className="record-icon">
                <Crosshair size={30} />
              </div>
              <div>
                <p className="eyebrow">PLAYER SERVICE RECORDS</p>
                <h3>Find your history.</h3>
                <p>
                  Search by Discord username. Revisit results, opponents, and
                  postgame details.
                </p>
              </div>
              <ArrowUpRight size={26} />
              <span className="record-index">02</span>
            </Link>
          </VistaIntro>
        </section>
        <section className="development-section">
          <div>
            <p className="eyebrow">03 / BUILT IN THE OPEN</p>
            <h2>
              The journey is
              <br />
              part of the game.
            </h2>
          </div>
          <div>
            <p>
              This is an active development project, not a finished release.
              Native startup, full gameplay conversion, campaign, sandbox
              systems, and final parity verification are still in progress.
            </p>
            <p>
              Normal setup uses your installed MCC Halo 2 Classic content. The
              project does not distribute the original game files.
            </p>
            <a
              className="button secondary"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Code2 size={17} /> Read the source & progress{" "}
              <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
