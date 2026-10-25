# Friends deployment

The friends backend and public tag bridge were activated on October 25, 2026.
Steam remains the login provider. Existing accounts receive an eight-digit tag
on their next verified connection; deployment does not allocate tags to dormant
accounts. Renaming preserves the suffix and relationships. Match names stay plain.

The release applies [the scoped patch](friends-deployed.patch) to the exact
running master baseline, rather than deploying unrelated work from the shared
game checkout. [The source manifest](friends-deployed-candidate.json) records
the original and candidate images and all runtime source hashes. Existing match
transport, enrollment, quota and playlist rules remain at their deployed versions.
Native client source/build delivery is separate from this server release.

The dedicated storage config matches the existing EOS product, sandbox and
deployment, uses its separate User-required storage client, and stays outside
both images and the website's shared state volume. Only the master mounts it.
Both services disable core dumps and limit process/thread count. The master has
a private temporary SDK cache; the website masks old rollout backups.

Before replacement, SQLite's backup API created a consistent, checked snapshot.
Private keys and the new encryption config were backed up outside the website
volume, with owner-only permissions. Rollback restores the previous images and
configuration without restoring SQLite or discarding new writes. Both previous
images and private backups remain on the host for recovery.

Qualification covers 52 applicable backend checks, 28 website checks, both exact
image manifests, isolated HTTP fixtures, private config loading and separate SDK
platform initialization. Two newer fixtures also fail against the unchanged
production baseline and are recorded separately; they are not passing checks.
The first rollout safely reverted after its backup-mask verifier treated denied
access as a failure. The corrected verifier accepts denied access or an empty
mask, and the repeated rollout passed.

Activation does not prove a real player cloud round trip. The first verified
account connection queues its record; exact EOS download read-back must succeed
before that owner's sync status becomes `synced`. Do not create fixture accounts,
backfill legacy tags, regenerate the encryption key or import cloud data as consent
to force that result. Private execution receipts remain in ignored deployment
storage and on the host; no credentials or player records are published here.
