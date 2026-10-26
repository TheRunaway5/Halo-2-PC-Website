# Halo 2 Forever website

A TypeScript Next.js App Router site for the Halo 2 native PC project, using the project's authored Vista UI SVGs. Includes a project landing page, EOS playlist top 25, player service records, display-name search, complete paginated match history, and full postgame carnage reports with downloadable public JSON.

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

The repository is `TheRunaway5/Halo-2-PC-Website`. GitHub Pages builds and deploys `out/` through **GitHub Actions** on pushes to `main` or manual dispatch, with custom domain **halo2forever.net**. The October 22, 2026 website update was pushed by **TheRunaway5**, and its Pages deployment succeeded. Check the repository's Actions runs for the current deployment revision.

GoDaddy DNS uses the four [documented GitHub Pages addresses](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` at `@`, and `www` CNAME `therunaway5.github.io`. Existing nameservers, email-related records and domain-connect records are preserved. GitHub’s DNS check passed and Enforce HTTPS is enabled.

## Live master integration

Friend tags use the current Halo display name plus a persistent, globally unique
eight-digit suffix, for example `EmkMage#12345678`. The master assigns a suffix
on the account's next authenticated connection, including existing accounts;
public website reads never allocate one. Renaming changes the name portion and
retains the suffix, account ownership, friends, stats and EOS bindings. Profiles
offer a copy button and searches accept either a partial display name or an exact
full tag. Match and report headings retain plain display names. Unassigned legacy
tags are omitted until the account reconnects. The website API remains read-only
and publishes no friend lists or block preferences. Deploy the master migration
before restarting the website API; older databases remain readable without tags.

Friendships use the existing master SQLite database and Steam authentication;
they require no additional hosting service or Epic Account Services login.
The current custom OpenID/PUID mapping and EOS display-name claim are unchanged.

A separate Node TypeScript bridge on the existing master host serves `/website/*`. It reads the master's existing SQLite database using `readOnly` and `query_only`. EOS publication uses a Rust SDK worker and a separate writable cache; it never writes the master database. It runs with a read-only filesystem, no Linux capabilities, private Docker networking, bounded memory/CPU and request limits. Credential files in the mounted master volume are masked. Caddy routes the prefix while preserving the game's original routes and WebSockets. The profile, population and EOS cache endpoints are deployed; remaining native-client acceptance is described in [the worker runbook](backend/eos-worker/README.md).

Public bridge endpoints:

- `GET /v1/website/status`: master readiness, public server count/advertised occupancy and aggregate authenticated population. `online` reports unique accounts and separate guests, with queued, joining, playing, postgame and menu counts, plus every configured playlist (including zero counts). Counts expire after 30 seconds without authenticated activity or a live challenged match connection. A proposal or queue-to-room handoff counts each seat once. A new search takes priority over an old postgame connection. Advertised public-server occupancy is not added to unique accounts. The bridge shares a five-second cache; the site refreshes every 30 seconds while visible. An older or unavailable master yields unknown population, displayed as a dash.
- `GET /v1/history/top25`: configured playlist IDs. `?playlist=...` returns the cached EOS top 25 for one playlist. The old SQL leaderboard implementation and its sorting/pagination API have been removed.
- `GET /v1/history/players/{public_id}/profile`: current Spartan/Elite appearance bytes, colors, emblem fields, separate service tag, server-issued join date and career counters. A missing legacy join date remains unknown. Player match-history responses also include these fields. Current customization never overwrites historical report appearance.
- `GET /v1/history/players?display_name=...`: read-only search of published players by their current display name. Matches any literal substring regardless of capitalization, including Unicode names, spaces and punctuation. Returns at most 50 records, with exact matches first and ties ordered by public ID. Players with the same name remain separate records. Each verified linked Steam account supplies an icon beside the name; hovering shows the Steam handle and clicking opens its profile. Steam-only players are searchable without a linked Discord account. The website bridge serves this search directly; deploying only the static site does not enable the new endpoint.
- Legacy Discord username search, public history and report paths are proxied to the original master. Only allowlisted GET paths can be proxied. Cookies and authorization headers are never forwarded.

Public skill emblems use `min(raw_rank, 49) + 1`, matching the master and original 50-frame UI. The actual authored SVG for each level is copied unchanged. Comet is level 49 and Halo ring is level 50; lunar/solar art covers levels 44–48. Leaderboard emblems show the selected playlist's current skill. Report emblems use the retained postmatch skill snapshot. Missing skill is shown as unknown; unranked hidden skill, private IDs and XP are never exposed.

Player profiles also show the saved player emblem and a Spartan or Elite model that rotates by mouse or touch drag (arrow keys rotate and Home resets the view), driven by the authenticated nine-byte appearance record. `public/profile/provenance.json` pins the retail menu cache, captured menu pose, decoded mesh and bitmap assets. The model uses screen 47 character-edit actors, the captured held-weapon pose, and the retained NV2A vertex, texture and register-combiner programs with original material bindings and cinematic lighting constants. Its final projection is fitted to the responsive panel; browser texture filtering and rasterization do not claim a pixel-identical Xbox framebuffer. A single profile header contains the emblem, display name, Steam link and membership details. A compact model column sits beside career statistics and match history; separate emblem headings, model labels and palette swatches are omitted. The player emblem uses the original 60-word register-combiner program and unchanged combiner arithmetic, the four saved palette colors and the original foreground/background bitmap pages. Body emblems use the separate foreground-only armor shader, selected emblem colors and toggle, all eight original foreground mips, transparent-border sampling and RGB-only alpha blending; UI backgrounds and UI flips are not stamped onto the armor. The renderer loads only on a profile, renders on view changes, and releases its GPU resources on navigation. Missing appearance remains explicit. A recorded `joined_at` is shown as a UTC calendar date; older accounts with no stored registration timestamp remain unknown rather than being assigned a migration or first-match date.

To regenerate the requested profile assets from the owned game checkout, run `scripts/export-profile-assets.py` through that checkout's `tools/run_test.py`, passing `--game-root` and the absolute website `public/profile` directory as `--output`. No game caches or account databases are included in the static export.

Spartan armor preserves the original color pass's alpha in the intermediate render target: the following Xbox lighting pass consumes it as the reflection mask. Only the final canvas output forces opaque armor alpha. Replacing that intermediate mask with full opacity makes the armor excessively reflective; the Elite rendering policy is unchanged.

The game master now owns `/v1/online/status` and derives the compatibility health counter from the same activity. The old website source-patching helper and queue-only tests were removed. Public population contains aggregate counts only; neither account IDs nor online rosters are exposed. Deployment and rollback evidence belongs in ignored `.local/deploy/`; local implementation does not establish production rollout.

## Assets and content

`public/vista/provenance.json` records original source paths and SHA-256 hashes for all copied SVGs, including rank artwork. These are existing authored replication studies; their reuse does not claim completed retail pixel parity. The landing page follows the game repository's actual development status and does not present unfinished gameplay as released.

On a visitor's first visit to any route, a Vista-styled modal explains that this is an unofficial fan project with no affiliation, endorsement, or sponsorship from Microsoft, Halo Studios, or Bungie. **Agree and continue** saves an acknowledgement in this browser's local storage under `halo2-fan-project-acknowledged-v1`; no acknowledgement is sent to the server. Returning visits skip the modal. If storage is unavailable, agreement still dismisses it for the current visit. The native dialog isolates keyboard focus and background interaction until agreement, then restores page scrolling.

## Vista motion

`lib/vista-motion-data.json` contains the original menu tracks and bitmap bindings extracted from Vista build `11081.07.04.30.0934.main`, `mainmenu.map` SHA-256 `eb259c207da26adc1820ae0757d23efb4ce1d2c2018956635d1094c8364f6b44`. Animation IDs are **one-based**. Tracks use equally spaced linear keys, following the game repository's `src/frontend_vista.cpp` parser and `src/frontend_painter.cpp` interpolation.

- Hero wordmark: animation 30, 250 ms fade. Overview/standings panels: animation 3, 310 ms slide. Record cards enter with animation 1, 320 ms, including its initial two-thirds hold at zero alpha.
- Player rows and their rank emblems: animation 11, 230 ms with the source 250 ms delay. Postgame surfaces use animation 7, 270 ms with a 150 ms delay. Rank art has no continuous rotation or frame cycling.
- Record cards have clean backgrounds with no scrolling material strips. Their border/background highlight uses the menu's 120 ms selection / 200 ms deselection. Table highlight transitions use the player skin's 1 ms / 300 ms selection timings.
- Loading artwork uses three concentric pairs of thin/wide textures with opposite rotation directions, quadratic startup thresholds of 1.5 / 2 / 2.5 seconds, and fixed 1:1/2:1/3 sizes. The website omits the source breathing effect and holds the rings at their initial diameter. Luminance masks remove the SVGs' black square plates and preserve the ring cutouts. `lib/vista-motion.ts` follows original `66A512` / `66A0E2` rotation and PE float constants from `src/vista_loading_geometry.cpp`.

Introductions run when a widget first enters view. Native 640px horizontal positions scale to the browser viewport; website layout, colors, SVG artwork and browser blending remain adaptations. This does not reproduce D3D shaders, x87 precision, the game's full loading screen, or exit transitions that would delay browser navigation. There is no fabricated progress indicator. The independent fixture in `tests/fixtures/vista-loading.json` retains only 20 samples of original executable draw positions/UVs (39 KB), with source hashes. Tests compare all six layers' rotation at startup boundaries and through one minute within `1e-5` normalized coordinates, and check that their diameters remain at the original initial size.

The header's **Pause motion** control persists locally. System reduced motion disables animation, decorative loops pause outside the viewport or while the tab is hidden, and introductions release their transforms when finished. Content remains visible without JavaScript. No dummy records are bundled with these animations.

Report detail tables retain source indices for unverified medal/weapon/statistic semantics. Older summary reports remain summaries. Guest personal data is excluded, while team totals may include guests. Dates are displayed in the visitor's local timezone.

There are **no demo routes or fake records in the production build**. Fictional screenshot fixtures are kept only in ignored `.local/`, run on loopback, and are never uploaded to the master or Pages.
