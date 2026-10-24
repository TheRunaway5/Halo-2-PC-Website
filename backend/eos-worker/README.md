# EOS player records and playlist standings

The website owns the TypeScript public bridge, publication scheduler, cache,
Rust SDK worker, stat manifest and deployment glue. The existing Python master
owns account authorization, Halo playlist/party/skill rules, immutable accepted
results and full carnage history. The native client uses Rust for EOS Connect,
Sessions, P2P and the new room token/proof HTTP requests. Native adapters retain
thread/message lifetime and existing game/UI ownership. Older account,
Steam/Discord and matchmaking request paths still include C++ network I/O.

## Current status

The latest qualified **uninstalled candidate** is
`bin/engine-builds/8ef531cf15624b8daead5ed088dab67e/halo2_native` (SHA-256
`92f8a321cf28eb3c24b629ec25a0f42212d26bbb72da948ffcf13e0c2d4a1b40`),
retained with its resources at 316,334,099 bytes. All eight native tests passed
(native report SHA-256 `fed94d36992484efeeaa4879cb6fea304dc85497b42a9aceb1b9ae47023bce6b`),
as did eight launcher checks, twelve map/player frame cases, four menus and
eighteen custom controller assets. The candidate report is
`Halo-2-Decompiled/analysis/eos-sdk-main-thread-candidate-20261024/report.json`
(SHA-256 `fd4abfe7bd169a584737cd7ee773b0e7a47271fc84ddbeb4d3a2093baae886c1`).
Prepare-only packaging published no ROOT launcher or selector.

The latest cached-profile run queued at **12:19:50 UTC on October 24**, using
the same uninstalled 8ef/92f8 candidate and a private worker-stderr observer.
EmkMage and Halo0001 entered Lockout Slayer at 6:23/6:21, then 5:16/5:14,
with scores 0/0. One-second mouse holds visibly reduced both HUD magazine
icons; the exact shot count is unverified. Later F3 captures were already
terminal menus, so this run provides no scoreboard or PCR claim.

This run also failed, around SDK time 234 seconds. Near 225 seconds, slot 0
(the native host and SDK session owner) stopped advancing its 92,611 data sends;
the SDK queue stayed at 65,479 bytes while reverse reception continued.
Backpressure reached 4,766. The client last accepted sequence 5,572/tick 5,570
and timed out at age 10,004 ms with zero rejected packets and 20,608 buffered
bytes. The host reached tick 5,883 with 6,008 accepted inputs, removal reason 0
and last-input age 397,660,793 ns. Actual failures now include both native-heavy
role alignments; that observation does not identify a role-only cause.

The SDK-free observer method initially failed loading; the diagnosed undefined
`rust_eh_personality` was resolved by a private LOCAL/HIDDEN abort-only symbol.
Version 4 passed all nine controls (report SHA-256
`98990d82b4f5f26f96fb96b136e1ae160826c8e98fa722435a25ed86c4d29a3e`),
then repeated all nine successfully inside the live owner before either client.
Its bounded captures were 14,808/13,854 bytes, with zero omitted windows or
collector errors; producer losses remain unmeasured. The scrubbed 248,298-byte
diagnostic contains connection/session/closing messages without a proven SDK
cause (SHA-256
`8c69c100805d303dc722d5434485319673b4033e994400decfb801a048ffbf10`).

Cleanup receipt `sdk-stderr-two-profile-cleanup-20261024.json` (SHA-256
`5f87d271dc5bb33b5f58c332618e2944a6a94bd6c2b89bd94ab8c7fcebc5fed8`)
verifies both parents exited zero and are absent, owner `f_jwixxw` was removed,
both SDK readers reached EOF and joined, and all 41 source pins were unchanged.
Private logs, captures, observer binaries and caches were removed; UI/retainer
helpers were archived as nonexecutable 0444 sources. The frozen closed UI proof
`ae7f2edd…` and final finished UI proof `12ccde60…` remain distinct.
The full-game-ELF worker versus standalone component context is under
source-only audit; it is not an established cause or fix. Completed-match,
result/publication, WAN, microphone and full-migration acceptance remain false.

An earlier actual cached EmkMage/Halo0001 run queued at **09:54:36 UTC on October 24**.
Both entered Lockout Slayer at 7:06/7:04, score 0/0; real F3 scoreboards later
showed both names tied at zero. The run still failed after about 206 seconds of
SDK traffic: the client timed out after 10,021 ms without an accepted snapshot,
and the host SDK outgoing queue remained at 65,530 bytes/107 packets while
reverse reception continued. Process-main ownership did not resolve this live
stall; longer duration alone does not prove improvement. Vendor SDK messages
were unobserved because child stderr was null, not because SDK errors were
proved absent. No PCR, completed match, accepted result or publication/readback
was obtained.

The bounded diagnostic is
`two-profile-sdk-main-thread-diagnostics-20261024.json` (223,984 bytes; SHA-256
`c0d9cbd3c4ecdcc12a53db5be9126d60bb864a2602dd29df1f5d87f731d633e3`).
The finalized UI report has SHA-256
`e3866c8f90898c71daa7849c454edfe0430f88973d54385fabfc5d0eff751d83`.
Cleanup receipt `sdk-main-thread-candidate-live-cleanup-20261024.json` (SHA-256
`29dc9438e6cd40ba901d5fa961daacb852d26174c04095602111ad2a535b6ab6`)
verifies both clients exited zero and are absent, build/UI owners were removed,
and raw logs, captures and build products were removed. Three one-off helpers
were retired as nonexecutable 0444 sources; the qualified reference candidate is
intentionally retained. Foreign ROOT selections were preserved.

Two private 240-second Rust native-size component controls have completed. The
debug/traced run failed its progress criterion: 160,800 offered forward datagrams
accounted exactly for 114 refusals, 26,852 Rust expiries, 472 stop cancellations
and 133,362 received datagrams; only 737/7,200 complete groups arrived. It did
not reproduce a stationary full SDK queue. Report SHA-256:
`204aba9d79242b573c1ac0642189c4f220076768275655a6514c633b4e6726a1`.

The Release/untraced control received all 160,800 forward datagrams/7,200 groups
and all 9,600 reverse inputs with zero expiry, refusal or SDK backpressure.
Host mean loop/pump times were 2.199/0.142 ms, but observed tick-gap maxima of
554/575 ms prevent a tight-bound claim from the means. It also reproduced no
stationary full SDK stall. Report SHA-256:
`486f12a865e38959ca297b6575da6eeccf4ef72bbf3a94986c8a3139e67f96ce`.
This combined execution-context comparison does not attribute the difference to
debug optimization or tracing separately and does not fix or accept the failed
8ef/92f8 native match. Both controls preserved all 41 production source pins,
completed SDK/remote shutdown and removed owned outputs. Cleanup receipts
`eos-native-size-main-thread-probe-cleanup-20261024.json` (SHA-256
`45cde9ac9ad259117a8e9e792145fc167b55b50446321573f323368daf9b26c1`)
and `eos-native-size-context-control-cleanup-20261024.json` (SHA-256
`639d4e137d53f28fb51418c1a23c787c41006da1d554a77beb536e195c080679`)
verify owner removal and no retained raw logs, SDK/build binaries or caches.

The first authenticated-profile prelude attempt (`777b3dd9…`) stopped at
library compilation: its 53-field JSON macro exceeded the recursion limit.
Report SHA-256 `0ab2429049086bb28d1a6b1d2c9e9dd1fcf082c154b0b270721f42aaefffd114`
remains failed; no SDK worker, credential-config read or network started. The
private reporting repair split the unchanged 38 baseline and 15 profile fields
without changing production code, policy or lifecycle.

The corrected prelude passed its 240-second component criterion. The production
identity API logged in, copied the proof and released its profile platform.
Official proof verification then preceded a fresh same-subject match grant,
retaining the same PUID and live SDK child.
The acknowledged parent proxy-handle ledger went 0→1→0 with no pending
retirements; these are not independent inside-SDK counts. No stationary SDK
stall appeared, but forward delivery was 160,609/160,800 datagrams and
7,189/7,200 complete groups: 153 refusals and 38 Rust expiries remain explicit.
All 9,600 reverse inputs arrived; the maximum complete-group gap was 946 ms.
This is neither zero-loss nor native-match acceptance. Report SHA-256:
`c515bece835ae97afd5142ec6873ab629789a0aac21584ad3374012f7c840639`.
Cleanup `eos-native-size-profile-prelude-cleanup-20261024.json` (SHA-256
`8a2135efc4d69d73c925ec07ba335f2485d6be37d5f6f9cbdc2de82a01a8ab4a`)
verifies the `oq031e8s` owner and private outputs removed; helper `3f58a7bf…` is
retained only as archived source. No idle duration was assumed.

The 240-second direction control also passed its component criterion. With
heavy traffic on slot 1 and light traffic on slot 0, while SDK session owner/P2P
initiator stayed slot 0, all 160,800 heavy datagrams/7,200 groups and all 9,600
reverse inputs arrived. Refusals, expiries and SDK backpressure were zero.
Maximum complete-group gaps were 89 ms at the heavy receiver and 102 ms at the
reverse receiver; slot 0/1 mean loops were 2.179/2.213 ms and SDK outgoing
high-water marks were 384/893 bytes. Both real profile/proof preludes retained
the same PUID/child and acknowledged handle lifecycle. No stationary full SDK
stall appeared, so the conditional 1,404-byte control did not run. Report
SHA-256 `c4eb3ab088dfa2e867f7cb16b79916ca3993c6bb09d3f4a73700bca75d0e411f`;
cleanup SHA-256
`b8848c63f3635be132e21c24e46d4f019a1bd28adf020fa56b17853b131c024d`
confirms owner `itlrso2u` removed, remote cache cleaned and helper `2871af26…`
retired as 0444 source. This synthetic role-alignment result does not establish
a role-only cause or native gameplay acceptance.

The source-derived QoS control completed its 240-second component criterion.
The unchanged native QoS owner ran beside heavy slot 1/light slot 0 traffic:
all 160,800 heavy datagrams/7,200 groups and 9,600 reverse inputs arrived, with
zero refusals, Rust expiries or SDK backpressure. Each peer admitted five
64-packet upload trains (one setup, four selected) without QoS refusals; both
actual QoS rows were measured with zero reported loss. The declared context
reset preceded load by 2 ms. Receiver maximum complete-group gaps were 79/51 ms,
slot 0/1 mean loops 2.165/2.192 ms, and SDK high-water marks 3,520/1,082 bytes.
No stationary full SDK stall appeared; the conditional 1,404-byte control did
not run. This source-QoS workload is component evidence, not native acceptance.
Report SHA-256:
`032277ef40de51b0f6202df4262f5ea39acc4ecc05f146f38dbfbb696f1c414b`.

Both real profile/proof preludes, same-PUID/live-child acknowledged ledgers and
all 41 production source pins remained intact. Cleanup receipt
`eos-native-size-qos-control-cleanup-20261024.json` (SHA-256
`6b26e6b3d3b5e4482c6c1cca25384c6f3483c54ee9d7ab1b4d78d904c0fb2b46`)
confirms owner `kpd1udni` and private outputs removed, remote cache cleaned, and
helper `10210e92…` retained only as a nonexecutable 0444 source.

The actual 8ef/92f8 native match remains failed. Completed-match, PCR,
ranked-result, publication, WAN, microphone, full-migration and ROOT-delivery
acceptance remain false. Historical V6–V10 evidence and the immutable deployed
backend candidate remain unchanged.

The earlier qualified **uninstalled candidate** is
`bin/engine-builds/cfdc426a2ef441c1b252ee4c35185290/halo2_native` (SHA-256
`8e5076550e4046cf4d47486fb4984bc1c69df5dd18379fa1cecf4b62f5bee044`),
retained with its resources at 315,360,388 bytes. Its five native checks, eight
launcher checks, twelve map/player frame cases, four menus and eighteen custom
controller assets passed. The first scoped native run remains failed at 3/5:
receiver and cold-receiver assertions incorrectly assumed a pristine tick zero.
The fixture correction records the actual owner/tick/full body hash and still
requires identity rejection without mutation or acknowledgment; the fresh run
then passed 5/5. Offline Rust qualification passed 103 protocol and 38 bridge
tests, with two existing ignored tests and both strict Clippy checks. The
packaging policy passed 29 unit/fault controls; the narrowed actual tool guard
passed six controls. These are component checks, not live-match acceptance.

The actual cached EmkMage (slot 0) and Halo0001 (slot 1) run queued Casual Lab
Slayer at **06:50:43 UTC on October 24**. Both joined visible Lockout Slayer
worlds at 7:57/7:54, score 0/0, then slot 0 returned to party and slot 1 showed
“Match connection failed.” Diagnostics recorded the SDK outgoing queue
stationary at 65,535 bytes/102 packets for about twelve seconds while pumping
continued; the complete cause remains unresolved. No PCR, shooting, accepted
result or result readback was verified. Both clients exited zero; the UI/build
owners, captures, private logs and GPU caches were removed. The candidate was
never globally selected. The unrelated shared selection, observed as `1775b14a…`
at review, was preserved. Acceptance and cleanup are recorded in
`Halo-2-Decompiled/analysis/eos-live-matchmaking-failure-20261023/two-profile-candidate-v2-acceptance-cleanup-20261024.json`
(SHA-256 `cf9c83f6c083772149a49b489155e2a3619e7b0a691d94730f72d600d4038e51`).
Full migration, WAN, microphone, ranked-result and completed-result acceptance
remain false.

A second run of the same cached profiles and unchanged cfdc candidate queued at
**07:53:07 UTC on October 24**. Both entered Lockout Slayer at 7:12/7:10,
score 0/0, before returning to party/player-left screens. Fresh poll samples
showed the host SDK queue stationary at 65,488 bytes/104 packets while reverse
reception continued. This does not establish the cause or prove a thread-related
stall. The numeric diagnostics and final UI reports are
`Halo-2-Decompiled/analysis/eos-live-matchmaking-failure-20261023/two-profile-sdk-observation-diagnostics-20261024.json`
(SHA-256 `4023f73c4b799e40d7d0b6db5c0a03a18b4d4d648fc99200bf57497c4d203114`)
and `Halo-2-Decompiled/analysis/eos-native-preparation-candidate-20261024-v2/two-profile-sdk-observation.json`
(SHA-256 `8c102b99e21059f995c90f95c1ced72c0c08c71dd7b6dc123b9ff4c7c2356b04`).
Both clients exited zero; their owner, raw captures, private logs and GPU caches
were removed (`sdk-observation-completed-helper-cleanup-20261024.json`, SHA-256
`d4e4220bd4c71458ee836f5237f7ebe874641e7ac670796a3134c56a984c515a`).
No completed match, PCR or result readback was obtained.

The separate serialized-caller SDK A/B comparison passed both ninety-second
cases: each received all 45,000 host and 2,700 input datagrams without SDK
backpressure or Rust expiry. The observed one-versus-three caller-role shapes
reproduced no stall. This generated workload does not prove thread causality,
process-main compliance or native gameplay acceptance; its report is
`eos-sdk-thread-ownership-ab-20261024.json` (SHA-256
`cd69b79031de084d3f0293b2987796727dfa038a8c770de85ce8e5779c4b22f2`).

Rust now routes the SDK through an explicitly registered self-executed worker
whose true process main owns SDK calls and lifetimes. The bounded IPC startup
repair consumes at most 4,096 preamble bytes and one versioned 22-byte marker;
subsequent frames remain strict. Fresh offline and SDK builds each passed 156
unique Rust tests (103 protocol, 53 bridge), with two existing ignored tests and
strict Clippy for both crates. Four private subprocess controls passed. Actual
SDK observation recorded six creates, six releases, at most two live platforms,
one shutdown, all on child process main, followed by child reap. This qualifies
the platform lifecycle, not authentication or gameplay. Evidence:
`sdk-main-thread-validation-20261024.json` (SHA-256
`62cac10d11f4e3200cc77d926451fb184d6e5baa5d42d79bc2e019a47a402d5c`);
its owned source, binaries and SDK scratch were removed.

The separate ninety-second generated SDK workload received all 45,000 host
and 2,700 input datagrams on the direct route. Forced relay did not receive 137
host and two input datagrams. Both component runs avoided a ten-second complete
group stall; neither is native snapshot, completed-match or zero-loss relay
acceptance. See `Halo-2-Decompiled/analysis/eos-live-matchmaking-failure-20261023/eos-sustained-route-conclusions-cleanup-20261024.json` (SHA-256
`ce99e5429b20febf6fc9ee371807e8f2a3142b4fe034f22cb1af3418554160ce`).

Earlier, V10 installed the diagnostic runtime
`bin/engine-builds/b77edf39fc734632b695adcc4d11e182/halo2_native` (SHA-256
`ae29ac68910496f7962ff6c909630e18ebc9c0f7ef1216e10d8880559befea22`).
Eight launcher/shadow checks, twelve MCC submitted-frame cases, four rendered
menus and eighteen project controller assets passed. Full delivery remains
failed: the positive common-cut case failed both before and after packaging,
with one unchanged full-suite repeat passing between those failures. A separate
read-only admission permitted a bounded diagnostic run, not full acceptance.

Both real cached profiles entered actual matchmaking twice. The second run
showed both Lockout Slayer worlds at 7:51 and score 0 before disconnecting;
neither run reached postgame, a drawn scoreboard or a carnage report. Host
outgoing progress stalled with queue-full observations and increasing expiry;
the complete cause remains unresolved. No accepted result or EOS result
readback was verified, and no public player/report queries were made. Both
clients and their owners closed cleanly; raw captures, private logs and GPU
caches were removed. The acceptance and cleanup receipts are
`Halo-2-Decompiled/analysis/eos-live-matchmaking-failure-20261023/two-profile-acceptance-v10.json`
and `v10-live-owner-cleanup.json`. Unrelated work selected runtime
`8681e66c5d024bf98a96539bb2f38890` after the two b77 clients launched; those shared
selectors and launchers were preserved. Earlier V6–V9 evidence remains
historical. The prior startup and actual keyboard navigation through
the local profile picker to ONLINE passed. The first real Steam account linked
to EOS; the trusted publisher read back all 27 expected profile/stat fields and
the public website profile API reports `statistics_source: "eos"` with its
customization. Completed-match publication, two-consumer-network gameplay,
microphone playback and complete-world host migration remain unverified.

An earlier full UI regression stopped at a missing selected imported bitmap
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
Real player login/profile binding and publication from the installed native
client have passed; completed-match publication and two-machine playable relay
gameplay remain acceptance work. The game client retains its Sessions-only
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

## Account-authenticated room transport (v14 backend and client delivered)

The [v14 contract](account-transport-v14.json) and
[canonical implementation patch](account-transport-v14.patch) describe room-bearer EOS
Connect authentication. The existing Python master remains the canonical owner
of room authorization; its existing Rust SDK worker verifies the EOS proof.
No second master source tree or new issuer/key/provider mapping is introduced.

A current physical room owner posts `{}` to
`/v1/matches/{room}/eos-token`, exchanges that short-lived OpenID token through
EOS Connect, then posts only the returned EOS ID token as `{"token":"..."}` to
`/v1/matches/{room}/eos-proof`. The server returns the verified
`eos_product_user_id`. Callers cannot select a private player UUID or PUID.
V14 signaling accepts only that account-bound identity; v13 retains its existing
anonymous behavior and cannot share a match with v14. Social sessions remain
active. The v14 setup window is120 seconds; v13 keeps60 seconds. Verification
admission waits at most2 seconds before a transient503; the owned worker has
a separate20-second creation/write/read budget. Cancelling a queued caller
preserves the active worker, while cancelling its owner retires that stream
before another proof can use it.

The scoped backend was deployed on October 23, 2026 as
`halo2-master-eos:20261023T173530Z-account-v14-candidate`. Its
[deployed-baseline patch](account-transport-v14-deployed.patch) changes only three
modules and preserves the other 33 deployed source files, including the existing
social and departure behavior. The actual image passed 44 applicable focused and
35 social checks, including all 17 new authentication/queue checks. Two current
canonical tests require unrelated behavior absent from the unchanged deployed
baseline; both exceptions are recorded separately rather than counted as passing.

The directory-only rollout preserved its four private files, created a consistent
542,527-byte SQLite/private-file backup, and verified all 36 source hashes,
configuration, internal/public health and unchanged other containers. Public
HTTPS also returned the backend's JSON 404 guards for unknown-room token/proof
requests. See the [sanitized rollout receipt](account-transport-v14-rollout.json)
and [rollout procedure](account-transport-v14-deployed-rollout.md).

The earlier 23-case native cohort passed, but its promotion was interrupted and
its unselected copied candidate was not an installation. V5 then passed twelve
MCC frame cases and four menus before its final strict resource-identity guard
refused publication; its candidate and owned build were removed. V6 subsequently
completed qualification and promotion. Its frozen source passed 97 Rust protocol
and 33 bridge tests plus strict all-target Clippy; two existing service-dependent
bridge tests remain ignored. Six focused native checks passed both before and
after installation: the five authentication/transport cases and the frontend
owner-readmission regression. Eight packaging checks, twelve MCC submitted-frame
cases and four rendered menu screens passed. At that delivery, the current-tool
verifier accepted the same installed runtime, 114-file inventory and eighteen
project prompt assets.
The [portable receipt](account-transport-v14-rollout.json) pins the delivery and
verification reports separately from the deployed backend evidence. No live
completed-match acceptance is inferred from installation or the subsequent
successful initial native join.

The v7 cancellation receipt records exit code 143, no publication and removal of
the owned build. An actual SDK burst regression reproduced queue-full send
failures despite successful Session callbacks; this component finding does not
identify the initial v6 live disconnect cause. V8's ordinary disconnect control
passed in 119.03 seconds, while its positive native common-cut process exited
zero with all expected markers before the wrapper's room-lifetime postflight
failed. The V9 fixture retains the original actual room objects before the
subprocess and preserves all native and zero-result checks. No V8 publication or
installation occurred. V9 then failed both MCC checks on a native memory
conflict. V10 applies the reviewed three-file fade-data correction pinned by
`Halo-2-Decompiled/analysis/eos-live-matchmaking-failure-20261023/v10-refresh-manifest.json`, SHA-256
`696cb1d9bdfb8ec6019ddbdf12f98866a71677ceb86245cc96846f15b5057573`.
Its 138 Rust tests and both strict Clippy checks passed, with two tests ignored.
The first native run passed 10/11; positive common-cut reported a serviced peer
expiry after 180.61 seconds, with actual cause unproven. An unchanged full
eleven-case repeat passed, including positive common-cut in 205.01 seconds and
ordinary disconnect in 87.28 seconds. The original failure and intermittent
flag remain recorded. Packaging subsequently passed its eight launcher/shadow,
twelve MCC frame and four menu checks. The post-native run passed the other ten
cases and failed positive common-cut after 242.02 seconds, leaving the full
delivery report false. The separate diagnostic admission and two failed live
attempts are recorded above; the unchanged repeat does not establish complete
migration readiness.

The separate four-fragment SDK pacing probe failed its strict check with
948/948 datagrams received in one direction and 940/948 in the other. This is
not accepted as zero-loss or native-match evidence. Native-match completion,
accepted results, WAN and microphone acceptance remain open. V10 remains a historical installed diagnostic candidate, not a fully accepted
delivery. The unrelated 8681 selection recorded during those tests was preserved;
the newer uninstalled candidate and observed foreign selection are described above.

The new room token/proof I/O belongs to a Rust client using the safe curl binding
and existing system libcurl. It validates fixed endpoints and headers, verifies
TLS, refuses redirects/proxies, bounds reply bytes, accepts only typed JSON
objects, applies request deadlines and cooperatively cancels pending I/O.
The native worker calls it outside SDK/Session locks. Actual loopback controls
cover proof POST/acknowledgment, redirect/header isolation, malformed/oversized
responses and cancellation; a dedicated regression rejects root-array replies.
This scope does not port every older sensitive HTTP path to Rust.

Rust also derives the bounded Session bucket from playlist/revision and starts
the Session admission clock after the first account acknowledgment and local SDK
identity. Actual production-derived two-peer SDK checks received 202 intact
1,404-byte packets for the capacity-four party tuple and 203 for Casual, through
forced relay with successful account proofs and clean SDK shutdown. These are
component fixtures; they do not establish a native match, four-player gameplay,
two consumer networks or microphones.

Separately, 28 current local population/profile/carnage/Steam contracts and seven
prompt/artwork tests passed using real Rust security policy in disposable
storage, with zero external network attempts. Their explicit current canonical
security adapter is not part of the deployed 36-file v14 overlay. At that snapshot,
thirteen canonical master modules differed from the historical 34-file accepted-result SDK
baseline; these local checks neither redeploy that drift nor repeat a production
result publication. The sanitized receipt records the separate source and test
scopes. Steamworks remains deferred at the user's direction.

A completed two-account match and result publication, WAN/microphone gameplay,
and complete host-migration readiness remain separate acceptance work. The v6
live test queued at 23:34:48 UTC and failed completion by 23:38:13 UTC. The host
summary recorded 1,822 frames/2,229 ticks and the client 857 frames/698 ticks;
each recorded one connected remote peer and a peak of two players. These are
observations before failure, not sustained-network or result-publication proof.
The portable receipt pins the failed live-test companion separately from the
successful delivery checks. Existing
prospective role owners and Rust scheduling are component-qualified; the six
remaining native aggregate/production-caller gaps remain open and migration
defaults remain disabled.

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

Server ingest/read-back, repeated absolute publication, clearing customization,
lowering a displayed rank and real-player login/profile publication have passed
live qualification. Before completing cutover, verify completed-match publication, populated playlist
isolation, tied ranks, offline recovery and two-machine relay gameplay. Back up the master
DB/signing key and retain a rollback image. Existing device-only EOS accounts
need an explicit recovery/migration plan before anyone relies on them.

Removed locally: `scripts/leaderboard-store.ts`, its old SQL-sort tests, obsolete
sort/pagination types/UI and the `/v1/history/leaderboard` route. The API regression
asserts that old path is gone. The one-off website master source patch and its
queue-only tests are superseded by the canonical master population API. Full carnage SQL and Halo rank math are retained
because they are still required. The legacy direct-peer transport remains available for existing v12 clients
until gameplay cutover acceptance; deleting it would break
those clients.

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

The client implements separate profile synchronization for authenticated couch
players, excluding guests and duplicate local sign-ins. Its primary sync is
pinned to the signed-in host profile. Account regression and UI translation-unit
syntax checks passed. The complete EOS client and launcher builds, native wiring
audit and all twelve MCC frame cases subsequently passed on an isolated NVIDIA
display. EOS was enabled in the already selected runtime after verifying its
source cohort exactly matched that build; all twelve checks passed again with
the packaged configuration. The earlier desktop failures remain an unresolved
diagnostic, rather than a confirmed EOS defect. Original runtime resources and
weapon-audio qualification were preserved.

The launcher home now has a single Play control. Both installed shortcut names
launch the supplied intro, title screen and main menu; multiplayer, content
previews and native tests remain explicit diagnostic commands. The replacement
runtime `bin/engine-builds/4a9dcc67f41a4169bcd6ac1ab1a5a088/halo2_native`
passed all twelve MCC frame cases, installed launcher checks and natural intro
playback followed by actual menu navigation to ONLINE. Seven launcher/movie
regression groups and sixteen build-promotion policy tests passed. Future engine
builds qualify and select their matching frontend before activation.

The user's Steam login in that installed build produced a master/EOS account
binding and a profile revision whose 27 expected fields matched SDK read-back.
The public website profile API also serves its EOS-backed statistics and
customization. The legacy account had no join date before this login, so its
date remains unknown; new registrations record their actual creation time.
Identity values are omitted from the release receipt. These checks do not
establish completed-match publication, two-consumer-network gameplay, microphone
playback or complete-world host migration. Disposable builds and captures were
removed; the selected runtime and existing user assets are retained.

The follow-up production image `halo2-master-eos:20261022T235241Z-profile-cache`
also removes repeated lifetime-history scans from native profile heartbeats and
public player/history reads. The master caches totals for at most 1,024 players
and five minutes; a new accepted result or profile revision invalidates that
player immediately. EOS publication/read-back still owns the replicated career
statistics; accepted results remain the authority for reconciliation. The scoped
master passed 25 tests, including the reproduced scan regression, revision
invalidation and expiry. The actual image passed cache and snapshot checks, then
deployed with a SQLite backup and health rollback. This saves repeated work on
the master; it does not move Halo rank calculations or full carnage storage to
Epic. The source overlay is [profile-read-cache.patch](profile-read-cache.patch).

Image `halo2-master-eos:20261023T000037Z-career-indexes` additionally indexes
career accuracy and report coverage by player. SQLite previously scanned every
player's weapon rows; the actual image now uses player-scoped index searches for
both queries. All 26 scoped tests passed. The same patch contains the two index
additions; no carnage rows or rank rules change.

The scoped image `halo2-master-eos:20261023T031806Z-social` adds remembered
Steam sign-in and Steam/clan party invitation endpoints. The native Rust bridge
stores each profile's refresh credential in the OS credential store. The master
retains only credential hashes, issues eight-hour sessions, expires refresh
credentials after thirty days, and revokes their issued sessions on Sign Out.
Steam OpenID does not grant private friend-list access: the server uses its
existing Steam API key, reports privacy failures explicitly, caches lookups for
sixty seconds, and filters online friends by immutable identity. Individual clan
invites recheck current clan membership and online presence. Existing party
leadership, capacity, blocks, consent and match rules still apply.

Eighteen applicable HTTP regressions and the actual image's schema/routes,
health and deployed source hashes passed. The separate party roster appearance
extension is excluded from this production overlay. That earlier native delivery
passed four focused identity/party tests, eight launcher checks, twelve MCC
submitted-frame cases and four frontend screens. At that delivery, all eighteen
installed Xbox/PlayStation prompt files matched the project's authenticated banks.
Before v6, gameplay and Dire Valley frontend selectors had separate owners;
those historical checks do not qualify the newer Rust HTTP replacement. The
subsequent real two-account join failure and verified v6 replacement are described
above. See
[the source overlay](steam-social-and-remembered-login.patch) and
[the rollout receipt](steam-social-rollout.json).

The follow-up `halo2-master-eos:20261023T040824Z-refresh-capacity` gives
thirty-day remembered credentials a separate 100,000-entry budget and indexes
expiry, account rotation and revocation lookups. A full remembered-token budget
still permits a verified login without persistence; it never evicts another
player. Nineteen scoped HTTP regressions and the actual image checks passed.
The rollout retained a private SQLite backup and verified all deployed source
hashes and service health.


The optional `validate.py --master-source PATH --master-tests PATH --node PATH`
qualification connects the actual master HTTP/result ledger to the TypeScript
publisher and real EOS SDK. Supply both existing live config arguments and a
Node 26 runtime at version 26.12 or newer. Run it inside the game's
`tools/run_test.py` owner; SDKs, Node artifacts, fixtures and databases remain in
its disposable storage. The master source can be the exact deployed overlay;
the matching master test sources supply explicit local authentication and PCR
fixtures. Only an isolated generated device-test EOS account receives writes.

The earlier qualification passed casual and ranked results in one cumulative ledger,
with six guest seats excluded, exact career/accuracy increments, original Halo
skill, separate playlist counters, actual ranked leaderboard read-back, duplicate
commits, lost publication replies and publisher restart. All 34 then-deployed
master files and both website publisher sources matched the qualified hashes.
The publisher/fixture hashes still match, but current canonical master security
changes have not received a fresh live SDK result run. The later scoped v14
deployment has its own exact 36-file manifest and 79 applicable checks.
Node type checking and all 16 website tests passed. The fixtures are declared PCR
inputs; this does not establish a played native match, relay gameplay, physical
microphone playback or complete-world host migration. See
[result-publication-qualification.json](result-publication-qualification.json).
