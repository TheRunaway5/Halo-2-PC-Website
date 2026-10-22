# EOS player records and playlist standings

The website owns the TypeScript public bridge, publication scheduler, cache,
Rust SDK worker, stat manifest and deployment glue. The existing Python master
owns account authorization, Halo playlist/party/skill rules, immutable accepted
results and full carnage history. The native client uses Rust for EOS Connect,
Sessions and P2P; only the thin official C ABI adapter is C++.

## Current status

Local implementation builds and focused tests pass. The native ONLINE UI build
succeeds, but its full UI regression stops at a missing selected imported bitmap
before service-tag assertions. Localhost browser checks cover the service tag,
Elite species, join date, K/D, shot accuracy and playlist selection using an
explicit fictional fixture. A separate localhost check runs three authenticated
test accounts through the actual Python master and TypeScript bridge: three
online accounts, one queued in Ranked, and two in menus render correctly with
no browser console warnings/errors.

The trusted publisher is created, IP-restricted to the master and development
machine, and its credentials are saved in the website repository's Actions
secrets. All 32 stat definitions and nine persistent playlist leaderboards are
created in Live Deployment. Official SDK qualification passed real publication
and read-back of 23 profile/career fields, duplicate absolute writes, LATEST
decreases/clears, all nine leaderboard queries and a populated ranked board
whose displayed level decreased. Qualification PUIDs have no master/public
alias and remain excluded from the website.

The production master and website API are deployed. The OpenID ID Token
provider is mapped to Live, and the public JWKS endpoint is available. Real SDK
qualification accepted a JWT signed by the production master and verified the
returned EOS ID token through the production trusted worker, matching its
account subject and exact product/client/sandbox/deployment scope. No master
account row was created by this qualification.

The website was published by TheRunaway5 on October 22, 2026. Its public API
serves all nine EOS leaderboard caches and live total/per-playlist population;
the deployed page rendered the counts with no browser console warnings/errors.
The master now also accepts the EOS v13 session/peer handoff in production.
Its three-file overlay passed 23 scoped Python checks and actual native SDK
qualification against the exact deployed source, including forced relay, eight
seats and signed synthetic voice packets. See [the transport release receipt](config/transport-release.json).
Real player login/profile binding from a delivered native client and two-machine
playable relay gameplay remain acceptance work. The game client retains its Sessions-only
policy. Additive profile/EOS schema changes are deployed; legacy join dates stay
unknown.

Both glibc deployment images built and passed isolated smoke checks, including
master health/population/JWKS/profile authorization and the website HTTP bridge.
The scoped production-master overlay passed 20 tests; the shared website passed
12 tests, type checking and its static production build on pinned Node 26.12.0.

## Identity and ownership

Keep Steam/Discord verification on the master. A PC's EOS device ID is not a
permanent account key. After existing account authentication, the master issues
an RS256 JWT with a two-minute lifetime, the stable private player UUID as `sub`,
and the chosen Halo name as `name`. Set `H2_EOS_OPENID_AUDIENCE=h2forever-profile-v1`.
The signing key is created once at `/state/eos-openid-key.pem` with mode 0600.
Back up that key with the other master private keys; never ship it to the game,
website browser, or public JWKS response. The public key endpoint is:

`https://master.halo2forever.net/v1/auth/eos/jwks`

Configure the EOS proprietary OpenID provider as **ID Token**, issuer
`https://master.halo2forever.net`, that public JWKS URL, the same audience and
display-name claim `name`, mapped to the Live sandbox. Verify the actual production
hostname and public endpoint before saving the provider. Epic's public provider
page does not specify every accepted JWT algorithm/issuer constraint; validate
the RS256 exchange in the sandbox before enabling it for players.

With `H2_EOS_PROFILES=1`, the native account worker uses the short-lived JWT with
EOS Connect Login/CreateUser, then copies the official EOS ID token. The master
passes that proof to the Rust worker's official `EOS_Connect_VerifyIdToken` call.
Binding requires OpenID account information, the exact master account UUID, game
client, product, sandbox, deployment and PUID. Existing bindings cannot silently
move to another PUID. Revoked sessions cannot complete a late binding. Guests
are not assigned persistent statistics.

Authenticated customization accepts exactly nine original profile appearance
bytes and a separate 0–4 character uppercase ASCII service tag. Species is
Spartan or Elite; four signed palette indices and all four emblem bytes are
retained unchanged. A server-created join timestamp is immutable. Pre-existing
accounts without a timestamp remain unknown. Current customization and the
historical 16-byte PCR appearance are separate records.

## Credentials and permissions

Use a separate server-only **H2Forever Profile Publisher** client policy with
`User required` unchecked. The saved limited scope is:

- Stats: `findStats`, `readStat`, `findStatsForAnyUser`, `ingestForAnyUser`.
- Leaderboards: `findLeaderboardDefinitions`, `findLeaderboardEntries`.

Keep all other service actions disabled, including untrusted game-client stat
writes. Use an IP/CIDR restriction for server credentials where the product's
client-policy configuration supports it. Keep trusted credentials only in the
server secret mount and the website repository's GitHub Actions secrets:
`H2_EOS_SERVER_CLIENT_ID`, `H2_EOS_SERVER_CLIENT_SECRET`. The existing five shared
product/sandbox/deployment/game-client variables remain in that repository.
GitHub secret storage does not automatically deploy them or expose them to PCs.

The worker reads process environment, or `H2_EOS_SERVER_CONFIG` pointing to a
private KEY=VALUE file. Required keys:

```
H2_EOS_PRODUCT_ID=<product>
H2_EOS_SANDBOX_ID=<sandbox>
H2_EOS_DEPLOYMENT_ID=<deployment>
H2_EOS_CLIENT_ID=<untrusted-game-client-id-for-identity-verification>
H2_EOS_SERVER_CLIENT_ID=<trusted-publisher-client-id>
H2_EOS_SERVER_CLIENT_SECRET=<trusted-publisher-secret>
H2_EOS_SERVER_CACHE_DIR=/absolute/private/cache/path
```

There is no shell expansion in this file. Keep credentials out of `NEXT_PUBLIC_*`,
public JSON, build arguments and committed files. The public bridge masks the
master's signing key and uses a distinct writable EOS cache directory.

## Statistics and leaderboards

Create the 23 definitions in [config/stats.json](config/stats.json) in the chosen
EOS deployment. These are definitions to review/create in Epic, not an invented
bulk REST endpoint. Use `MAX` for absolute lifetime counters. Use `LATEST` for
appearance, service-tag characters and the split join timestamp. Join time is
`H2_JOINED_DAY * 86400 + H2_JOINED_SECOND`; `H2_JOINED_KNOWN=0` means unknown.
Service tags use four ASCII character stats with zeroes for trailing/cleared
characters. Preserve signed palette indices; do not clamp them to web colors.

Accuracy uses original PCR weapon categories 5 through 38, field 4 for shots
and field 5 for hits, as consumed by `vista_pcr_results.cpp`. The website shows
coverage when older summary-only reports have no weapon detail. K/D and accuracy
are calculated from counters; guessed general-stat indices are never used.

The checked-in `config/leaderboards.json` contains the nine verified current
catalog IDs and actual SDK leaderboard IDs. Add one stat and one leaderboard
definition for each future catalog playlist. For ranked
playlists, use a `LATEST` public display-level stat and a `LATEST` leaderboard.
This preserves Halo's current displayed level, including level decreases and
ties; private raw skill/XP is not published. Unranked playlists may use total
playlist kills with a `MAX` stat/leaderboard. Copy Epic's actual leaderboard ID
into the deployment configuration. The separate
[config/leaderboards.example.json](config/leaderboards.example.json) is a schema
example, not an enabled playlist.
The 23 base stats plus up to 64 playlist stats stay within EOS's documented 500
stat definitions. There is no combined all-playlists leaderboard fallback.

Accepted results enqueue a revision in the same SQLite transaction as the
result, history and Halo skill updates. A separate writable cache records the
last observed publication revision. The bridge reads at most four eligible
players per 15-second pass with rotating queue order, serial SDK calls and
per-player failure isolation. It publishes absolute values, never replayable
`SUM` increments. An ingest success is only receipt; every value must be queried
back before publication advances. Current records are queried again after five
minutes, and mismatches are republished. Failed requests remain pending.
Monotonic counter definitions cannot lower a previously published erroneous
counter; any correction needs an explicit reviewed EOS data repair.

Leaderboard queries cache up to 1,000 EOS rows for five minutes. Public output
joins them to existing public UUID aliases, selects up to 25 known accounts,
strips PUIDs/private IDs and retains Epic's rank values. Unmapped qualification
accounts cannot occupy public slots. Career totals use EOS only when the observed source revision
matches and the cache is no more than 15 minutes old. Otherwise the API serves
accepted master totals. Full match reports, player history, immutable rank
snapshots and account ownership remain on the master.

Live population uses existing authenticated activity and challenged match
connections on the master. It publishes unique account counts and separate
guest seats, both globally and per playlist, partitioned into menus, queued,
joining, playing and postgame. Thirty-second expiry, session/seat deduplication,
queue-to-match ownership and a new-search-over-old-postgame priority keep the
counts consistent. The public bridge shares a five-second cache and publishes
no account IDs or online roster. Advertised public-server occupancy remains a
separate measure. Missing counters display as unavailable.

## Build and deployment

The SDK is licensed and remains outside Git. Linux x86_64 container example:

```
docker buildx build --build-context eos-sdk=/private/EOS/SDK \
  -f backend/eos-worker/Dockerfile --target website-api \
  -t halo2-website-eos:local .
```

The image uses glibc Debian; the EOS Linux library does not run in the old Alpine
API image. For the master target, also provide the existing game backend source:

```
docker buildx build --build-context eos-sdk=/private/EOS/SDK \
  --build-context master-source=/path/Halo-2-Decompiled/multiplayer/master_server \
  -f backend/eos-worker/Dockerfile --target master \
  -t halo2-master-eos:local .
```

Apply [compose.example.yaml](compose.example.yaml) after the existing
`scripts/compose.api.yaml`. Create the private cache bind directory owned by uid
10001 and a readable private server config. Set `EOS_SDK_DIRECTORY`,
`EOS_SERVER_CONFIG`, `EOS_LEADERBOARDS_FILE`, and `EOS_CACHE_DIRECTORY` to absolute
operator-owned paths. The base compose's private network, read-only master data,
key masks and Caddy route stay in effect. Apply the master override after the
game's existing production/matchmaking compose files with the built master image.
Both services need EOS network egress; neither publishes a worker HTTP port.

Keep one publisher per deployment/source database. An EOS outage does not make
unverified counters authoritative or stop existing account/social reads. Turning
off the EOS worker/cache environment restores master career totals. The removed
SQL leaderboard API is not restored automatically.

## Validation and removal checklist

Run website `npm test`, `npm run typecheck`, and `npm run build` with the pinned
Node version. The SDK worker has its own disposable validation:

```
python3 /path/Halo-2-Decompiled/tools/run_test.py -- python3 \
  backend/eos-worker/validate.py --sdk-archive /private/EOS-SDK.zip \
  --report .local/validation/eos-worker.json
```

This checks formatting, identity scope guards, vendor ID validation and a release
link against the official SDK. SDK headers, binaries and Cargo outputs are
removed with the owned scratch directory. It does not ingest real player data.

For disposable deployment-image validation (Docker must be running):

```
python3 /path/Halo-2-Decompiled/tools/run_test.py -- python3 \
  backend/eos-worker/validate_containers.py --sdk-archive /private/EOS-SDK.zip \
  --master-source /private/reviewed-master-source \
  --report .local/validation/eos-containers.json
```

Use the merged source or a reviewed overlay against the exact production
baseline when the shared checkout contains other active work. Include the
master's original `retail_gathering.json` and rank data files. Pass
`--master-catalog /private/current-playlists.json` to exercise the actual catalog
in the disposable container. An initial production attempt omitted the original
gathering configuration and rolled back on failed health checks; adding the
unchanged file and testing startup with the live catalog resolved it. The
validator now refuses source contexts missing those runtime configurations.
This creates a
private named builder, builds both images, checks SDK dynamic dependencies and
HTTP behavior without network access, then removes its images, builder and
extracted SDK. It does not update running production services.

Server ingest/read-back, repeated absolute publication, clearing customization
and lowering a displayed rank have passed live qualification. Before cutover,
verify a real player's login/profile binding, delayed publication, populated playlist
isolation, tied ranks, offline recovery and two-machine relay gameplay. Back up the master
DB/signing key and retain a rollback image. Existing device-only EOS accounts
need an explicit recovery/migration plan before anyone relies on them.

Removed locally: `scripts/leaderboard-store.ts`, its old SQL-sort tests, obsolete
sort/pagination types/UI and the `/v1/history/leaderboard` route. The API regression
asserts that old path is gone. The one-off website master source patch and its
queue-only tests are superseded by the canonical master population API. Full carnage SQL and Halo rank math are retained
because they are still required. The legacy direct-peer transport is still the
currently deployed default and can be removed only after EOS transport cutover
and runtime verification; deleting it now would break existing clients.

## Cross-host transport qualification

The optional `validate_wan.py` helper builds the current game Rust bridge against
the licensed SDK on a specified SSH Docker host. It exchanges 1,404-byte packets
through forced Epic relay and EOS Sessions with this Linux PC. Generated device
state, credentials, binaries, builder and image are private and disposable. It
creates anonymous EOS qualification users, with no master account binding or
statistics publication. It is not two-consumer-NAT or playable-game acceptance.

```bash
python3 /path/to/game/tools/run_test.py -- python3 backend/eos-worker/validate_wan.py \
  --game-root /path/to/game --sdk-archive /private/EOS-SDK.zip \
  --game-config /private/game-client.env --host your-ssh-host \
  --report .local/validation/eos-wan.json
```

The October 22 WAN qualification passed in both modes: forced relay received
273-293 intact packets per peer; normal routing selected direct transport and
received 284-287 packets per peer. All packets were 1,404 bytes, with EOS Sessions
enabled. This exposed and fixed a Rust ordering race where an SDK connection
request arrived before its authenticated roster binding. Pending requests are
bounded to 32, expire after 30 seconds, and grant no access until their PUID is
bound to an admitted physical slot. The game runtime qualification includes
that fix. Add `--allow-direct` to the command above to test normal routing.
