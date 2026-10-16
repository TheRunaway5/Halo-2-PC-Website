import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  queueCounter,
  patchMasterStatus,
} from "../scripts/patch-master-status.ts";
test("master count includes party seats, excludes expired tickets and deduplicates players", () => {
  const probe = spawnSync(
    "python3",
    [
      "-c",
      queueCounter +
        `
from types import SimpleNamespace as S
seat=lambda name:S(id=name)
ticket=lambda expiry,names:S(expires_at=expiry,players=[seat(n) for n in names])
api=S(clock=lambda:100,core=S(tickets={'party':ticket(120,['a','b','guest']), 'other':ticket(125,['d','a']), 'expired':ticket(100,['stale'])}))
assert website_matchmaking_players(api)==4
api.core=None
assert website_matchmaking_players(api)==0
print('ok')
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /ok/);
});
test("master source patch refuses unknown or already-patched files", () => {
  assert.throws(() => patchMasterStatus("unknown"));
  const original =
    'class Directory:\n    async def health(self, request):\n        return web.json_response({"peers": self.peer_status})';
  const patched = patchMasterStatus(original);
  assert.ok(
    patched.includes('"matchmaking_players": website_matchmaking_players'),
  );
  assert.throws(() => patchMasterStatus(patched));
});
