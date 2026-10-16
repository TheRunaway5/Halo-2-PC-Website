import Link from "next/link";
import { ArrowUpRight, Crosshair, Code2 as Github } from "lucide-react";
export const sourceUrl = "https://github.com/TheRunaway5/Halo-2-Decompiled";
export function SectionTitle({
  number,
  eyebrow,
  title,
  children,
}: {
  number: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          <span>{number}</span> / {eyebrow}
        </p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  error = false,
}: {
  title: string;
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`empty-state ${error ? "error-state" : ""}`}
      role={error ? "alert" : "status"}
    >
      <Crosshair size={32} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Loading({
  text = "Contacting master server",
}: {
  text?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <img
        className="loading-ring"
        src="/vista/vista-loading-thin-mechanical-ring.svg"
        alt=""
      />
      <span>{text}…</span>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Link href="/" className="footer-brand">
          HALO 2 <span>FOREVER</span>
        </Link>
        <p>A community project. Built for the love of the game.</p>
      </div>
      <div className="footer-right">
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          <Github size={15} /> Project source <ArrowUpRight size={13} />
        </a>
        <small>
          Independent fan project. Not affiliated with Microsoft or Bungie.
          <br />
          Halo and related marks belong to their respective owners.
        </small>
      </div>
    </footer>
  );
}
