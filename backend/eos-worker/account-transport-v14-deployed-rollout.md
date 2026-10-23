# Account-bound EOS transport v14: directory rollout

This is the reviewed procedure for the deployed-baseline overlay. The helper
defaults to a local plan and does not contact SSH in that mode. Authoring and
local validation do not deploy, restart, push, change keys, or change Epic policy.

The candidate adds room-bearer EOS token/proof endpoints, account-bound v14
signaling admission and a bounded proof-verification queue. It preserves v13,
social sessions, Halo queue/playlist/rank rules and the existing issuer/keys.
There is no database schema migration. Website API and GitHub Pages are outside
this rollout.

From the Website repository, inspect the candidate metadata and plan:

```bash
python3 backend/eos-worker/account-transport-v14-deployed-rollout.py --plan
```

The metadata must name the exact qualified image ID/tag and 36-file manifests.
The original image is pinned to
`sha256:ddd0682cecbdb2301936ef5cd291ffa6e70ca403fd68bb0dc22fb7489d545809`.
Only `couch_players.py`, `eos_identity.py` and `match_transport.py` may differ.
The helper checks the patch and qualification-receipt hashes locally. The two
documented unchanged-baseline test exceptions are not counted among the 79
applicable passing checks (44 focused and 35 social); 17 new auth/queue checks
are included in those results. Component qualification does not establish a
successful real player match or WAN gameplay.

After root reviews the concrete image, native qualification and this plan,
explicit execution requires the exact metadata SHA-256 printed by `--plan`:

```bash
python3 backend/eos-worker/account-transport-v14-deployed-rollout.py \
  --execute --metadata-sha256 REVIEWED_METADATA_SHA256 \
  --receipt /absolute/path/to/new-sanitized-rollout-receipt.json
```

The execution uses the existing strict-host-key `halo2-master` SSH alias. It
authenticates the current container's image, source contents, Compose project,
service, working directory, exact ordered 11 Compose inputs and existing named
state volume. The reviewed metadata pins SHA-256 for every Compose input;
their bytes are checked before backup and immediately before candidate or
rollback replacement. The exact original labelled
`/opt/halo2/website-api/compose.variables.env` is explicitly supplied with
`--env-file`, and its bytes plus every actual directory regular-file bind
dependency are pinned. Environment values remain in server memory. The helper
removes ambient overrides for the three verified interpolation names; it does
not reconstruct missing values. Before backup and before each replacement,
the entire resolved directory configuration, excluding only `image`, must
match its reviewed digest. Both immutable local images are inspected with temporary
network-disabled, read-only Python containers; neither application entrypoint
runs during image authentication. No image is pulled or built.

Before replacement, the current container creates a private backup below
`/state/.rollout-backups/account-v14-<UTC>-<random>/` on
`halo2-directory-prod_master-data`. SQLite's backup API captures committed WAL
contents into one consistent `registry.sqlite3`; copying a live database/WAL
pair is not used. `PRAGMA quick_check` must pass. The four existing private files
(`master-key.json`, `eos-openid-key.pem`, `admin-token`, `peers.json`) are copied
and compared entirely on the server. Backup directories are 0700 and files
0600. Existing database/file permissions are not broadened or changed. Private
backups stay on the server, are not emitted as logs or downloaded, and are
retained for an explicit later recovery decision. Their path and total size
appear in the sanitized receipt.

Backup and key checks use the container's existing configured service user
(`10001:10001` on the reviewed image). All capabilities remain dropped. The
first attempt stopped before creating a backup or replacing the image because
an explicit UID 0 override could not traverse `/state` (0700, owned by 10001)
without DAC override capabilities. The corrected helper removes that user
override; it does not change permissions or add capabilities.

A private versioned directory under `/opt/halo2/eos-account-v14-<UTC>-<random>/`
retains candidate and rollback Compose overrides. Each override changes only
the `directory` service's image, pinned by immutable image ID. The helper uses
the same ordered 11 existing Compose files followed by its override:

```text
docker compose --env-file /opt/halo2/website-api/compose.variables.env \
  --project-name halo2-directory-prod \
  --project-directory <existing master_server directory> \
  -f <existing file 1> ... -f <existing file 11> -f <versioned image override> \
  up -d --no-deps --no-build --pull never directory
```

Successful postflight requires the exact candidate 36-source manifest, same
state volume, four unchanged private files/modes, Docker health, internal
`/v1/health` and public HTTPS `/v1/health` returning ready. Other containers'
IDs, images and start times must remain unchanged. Captured command stderr,
environment values, database records, private-file contents and token/PUID
values are never copied into the receipt.

Any failure after replacement begins triggers the same directory-only command
with the original immutable image override, followed by original source and
health checks. Rollback does **not** restore SQLite or private files: this
overlay has no schema migration, and automatic data restoration could discard
writes received during the rollout. A failed rollback reports
`operator_action_required: true`; do not retry blindly. An interrupted SSH
connection without a final receipt also requires inspecting the private server
rollout state before another attempt. The remote owner handles ordinary
termination signals and keeps rollback within its ownership; machine loss or
an uncatchable kill cannot guarantee automatic recovery.

The local receipt path is exclusively reserved and fsynced with a started
marker before SSH opens. An existing/unwritable destination refuses before
remote effects. The final sanitized result still prints if persisting that
local file fails. A successful rollback leaves its additional Compose override
in the container's configuration label; the helper then deliberately refuses
a blind retry against the original 11-input baseline.

The helper's lock prevents concurrent runs of this helper, not unrelated
administration. Schedule the execution without another deployment, and treat
any changed baseline, Compose inputs, key metadata or source hashes as a new
review. After a successful rollout, verify the delivered native client's v14
account binding and a real two-account match separately. Do not enable host
migration from this backend receipt.
