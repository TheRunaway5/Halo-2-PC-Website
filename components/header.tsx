"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Code2 as Github } from "lucide-react";
import { sourceUrl } from "./ui";
export function Header() {
  const path = usePathname();
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Halo 2 Forever home">
        <img src="/vista/halo2-title-wordmark.svg" alt="Halo 2" />
        <span>FOREVER</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/" aria-current={path === "/" ? "page" : undefined}>
          The project
        </Link>
        <Link
          href="/leaderboard/"
          aria-current={path.startsWith("/leaderboard") ? "page" : undefined}
        >
          Leaderboard
        </Link>
        <Link
          href="/players/"
          aria-current={
            path.startsWith("/players") || path.startsWith("/carnage")
              ? "page"
              : undefined
          }
        >
          Player search
        </Link>
      </nav>
      <a
        className="source-link"
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Github size={16} />
        <span>GitHub</span>
        <ArrowUpRight size={13} />
      </a>
    </header>
  );
}
