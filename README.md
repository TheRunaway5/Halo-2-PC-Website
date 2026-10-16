# Halo 2 Forever website

A TypeScript Next.js App Router site for the Halo 2 native PC project, using the project's authored Vista UI SVGs. Includes a project landing page, all-time combat leaderboard, exact Discord username search, complete paginated match history, and full postgame carnage reports with downloadable public JSON.

The website uses Node **26.12.0**, Next.js **16.4.2**, React **19.3.1**, and Tailwind CSS **4.3.3**, verified when created on October 16, 2026. Dependencies are pinned in `package-lock.json`. Setup follows the [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind's Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs); Node's current release is listed on its [download page](https://nodejs.org/en/download).

## Local development

```bash
nvm use
npm ci
npm run dev
```

The default master API is `https://master.halo2forever.net/website`. `.env.example` documents the optional `NEXT_PUBLIC_MASTER_API_URL` override. This is a public base URL, never a credential. No Discord tokens, login, admin keys, or cookies are needed by the website.

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`build` writes a static site to `out/`; `preview` serves it at `http://localhost:3000`. Player and report URLs use query parameters so that any public UUID can work on GitHub Pages without rebuilding.

## Hosting

The repository is `TheRunaway5/Halo-2-PC-Website`. GitHub Pages is configured for **GitHub Actions** with custom domain **halo2forever.net**. The local workflow builds and deploys `out/` after a future push to `main` or a manual dispatch once the workflow exists remotely. No source commits or pushes were made during initial setup. The website itself remains unpublished until the owner publishes the local work.

GoDaddy DNS uses the four [documented GitHub Pages addresses](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` at `@`, and `www` CNAME `therunaway5.github.io`. Existing nameservers, email-related records and domain-connect records are preserved. GitHub’s DNS check passed and Enforce HTTPS is enabled. The first Pages content deployment remains pending because no source push was authorized.

## Live master integration

A separate Node TypeScript bridge on the existing master host serves `/website/*`. It reads the master's existing SQLite database using `readOnly` and `query_only`. It has no database writes or schema migrations. It runs with a read-only filesystem, no Linux capabilities, private Docker networking, bounded memory/CPU and request limits. Credential files in the mounted state volume are masked. Caddy routes the new prefix while preserving the game's original routes and WebSockets.

Public bridge endpoints:

- `GET /v1/website/status`: master readiness, public server count, players in public servers, and active matchmaking player seats. Matchmaking counts exclude expired tickets, deduplicate seats, include party/guest seats, and include match proposals until tickets leave matchmaking. The site refreshes status every 30 seconds while visible.
- `GET /v1/history/leaderboard?sort=kills&limit=25&offset=0&playlist=...`: all-time public combat totals; sort by kills, wins, matches or K/D. Wins include tied first-place finishes. Zero-death players with kills sort first for K/D. Guest/unknown histories are excluded.
- Existing public player search, history and report paths are proxied to the original master. Only allowlisted GET paths can be proxied. Cookies and authorization headers are never forwarded.

Public skill emblems use `min(raw_rank, 49) + 1`, matching the master and original 50-frame UI. The actual authored SVG for each level is copied unchanged. Comet is level 49 and Halo ring is level 50; lunar/solar art covers levels 44–48. Leaderboard emblems show the selected playlist's current skill, or highest recorded ranked-playlist skill for all playlists. Report emblems use the retained postmatch skill snapshot. Missing skill is shown as unknown; unranked hidden skill, private IDs and XP are never exposed.

`scripts/patch-master-status.ts` makes one additive health-response patch against the exact running master source. The patch reports only an aggregate matchmaking count. It refuses unexpected or already-patched source. The original game repository is not modified. Production image and rollback paths are recorded in ignored `.local/deploy/` evidence and the master host's `/opt/halo2/website-api/` deployment directory.

## Assets and content

`public/vista/provenance.json` records original source paths and SHA-256 hashes for all copied SVGs, including rank artwork. These are existing authored replication studies; their reuse does not claim completed retail pixel parity. The landing page follows the game repository's actual development status and does not present unfinished gameplay as released.

Report detail tables retain source indices for unverified medal/weapon/statistic semantics. Older summary reports remain summaries. Guest personal data is excluded, while team totals may include guests. Dates are displayed in the visitor's local timezone.

There are **no demo routes or fake records in the production build**. Fictional screenshot fixtures are kept only in ignored `.local/`, run on loopback, and are never uploaded to the master or Pages.
