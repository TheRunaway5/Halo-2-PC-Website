# Security Cloud remediation, 2026-10-28

Scope: [the October 27 website scan](https://chatgpt.com/codex/cloud/security/runs/wfr_1f3b002137af9d023ce727a9db62dd00d218021ad82ba8a91e2a093433eb7cf7)
against `7bbf11624daebff410a1541f54313aecf9fe12e3`, plus the paired game scan.
The saved website findings artifact contains one high, three medium and one low
finding. Local edits have not changed Cloud status or deployed either service.

| Finding | Remediation |
| --- | --- |
| `csf_a30e824ef03dd35a71532dc9` — candidate-controlled rollout attestations | Trusted host Python reads a bounded Docker export without executing subject-image code. In addition to the reviewed source hashes, the candidate's complete filesystem must match the pinned trusted baseline except for the three explicitly reviewed application sources; runtime image configuration must match as well. Interpreter replacement, startup hooks, dependency changes and extra code fail admission. Running-source checks also hash Docker-exported bytes. Protected-state backup and comparison execute only in an isolated, pinned baseline helper; key comparisons mount state read-only and compare with expected digests retained only in trusted host memory, so replacing both live files and backup copies cannot forge preservation. Internal HTTP health is queried from the host. No candidate interpreter supplies authentication or preservation evidence. |
| `csf_d8235f8cd06cdc8b6e2e2471` — reviewed metadata read/hash race | Metadata is opened once without following its final link, admitted by descriptor type, owner, write permissions and a 1 MiB size ceiling, read into one immutable byte buffer, and checked for in-place modification. The reviewed digest and JSON parsing use exactly that buffer. Qualification artifact hashing uses the same helper. |
| `csf_4c25627d1fe9cbfe685ec917` — Steam presence bypasses Halo blocks | The shipped Steam overlay consults the current bilateral friends predicate after every upstream lookup, including cached results. Blocked registered rows are omitted before registration or Halo presence is projected. The current game backend has the same fix. |
| `csf_bb3e3e3d5fc9cab071177944` — EOS refresh scans the whole outbox | Each pass reads at most 32 indexed player keys after a stable cursor. Every examined row advances the cursor, including fresh cache hits and failed publications. At most four publications proceed. A later empty page restarts the bounded traversal. |
| `csf_be4d7475f3b36c635192f1b6` — public identity plus block-dependent search | Public friend search now returns the same public identity projection across either block direction. Names, stable public IDs and tags remain public. The user explicitly chose to retain public discovery and document that unavailable friend/clan/party actions can make a block inferable. Hiding that fact across all interactions is outside the chosen policy; communication, bilateral presence filtering and private block lists remain enforced. |

The trusted baseline image ID and the reviewed metadata digest are the rollout
trust anchors. This helper admits only the original three-source change; a
release requiring a new dependency or interpreter needs new explicit
qualification. The two runtime-generated `/etc` host/resolver files and hostname
are excluded from filesystem comparison. Export admission bounds entries,
per-file bytes, total streamed bytes, extended headers and elapsed time. It
never extracts candidate paths onto the host filesystem.

Existing image/candidate receipts describe historical builds. Editing a source
overlay or the verifier does not requalify those images, update their recorded
hashes, or authorize a deployment. No SSH rollout was executed. Live Docker,
provider and production acceptance remain separate from the local adversarial
verifier checks.

Validation reports are in `build/test-results/security-scan-20261028`: the EOS
regression failed before repair with 1,000 cache statements for 500 fresh rows;
it now checks a maximum of 64 statements and forward cursor progress. A
deterministic metadata pathname swap authorized different parsed bytes before
repair and is now rejected. Seven Python checks exercise metadata types/modes,
forged interpreter/startup-hook filesystem deltas, trusted state-helper
selection, tampering with both live keys and backup references, the actual shipped Steam overlay in both cached block directions,
and block-independent public friend search. All 29 website tests, TypeScript
checking and the production static build pass on the repository-pinned Node
26.12.1. These checks do not claim a clean Cloud rescan or production activation.
