// Consumes only caller-owned fixtures and an isolated device-test PUID.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { EosService, EosWorker } from "../../../scripts/eos-service.ts";

const [manifest, state] = process.argv.slice(2);
const user = process.env.H2_EOS_QUALIFICATION_USER!;
assert.match(user, /^[0-9a-f]{32}$/);
const cases = JSON.parse(readFileSync(manifest, "utf8")).cases;
const boards = JSON.parse(readFileSync(new URL("../config/leaderboards.json", import.meta.url), "utf8"));
const jobs: string[] = [];
const fake = process.env.H2_EOS_RESULT_FAKE === "1";
const counterNames = { matches: "H2_MATCHES", wins: "H2_WINS", kills: "H2_KILLS", deaths: "H2_DEATHS", assists: "H2_ASSISTS", shots: "H2_SHOTS", hits: "H2_HITS" };
let previousPlayer: string | undefined;
for (const row of cases) {
  if (previousPlayer) assert.equal(row.player, previousPlayer);
  previousPlayer = row.player;
  const db = new DatabaseSync(row.database);
  db.prepare("INSERT OR REPLACE INTO eos_players VALUES(?,?)").run(row.player, user);
  const worker = fake ? { close() {}, async request(job: any) { return job.op === "board" ? { records: [] } : { stats: job.stats }; } } : new EosWorker(process.env.H2_EOS_WORKER!);
  let ambiguousReply = false;
  const traced = { close() { worker.close(); }, async request(job: any) {
    jobs.push(job.op);
    const reply = await worker.request(job);
    if (job.op === "publish" && !ambiguousReply) {
      ambiguousReply = true;
      throw new Error("Injected lost reply after the actual SDK publication");
    }
    return reply;
  } };
  const service = new EosService(db, "unused", state, boards, traced);
  try {
    const deadline = Date.now() + 150_000;
    let observed = false;
    do {
      await service.refresh();
      const player: any = { id: row.public, statistics: {} };
      service.enrich(player);
      if (player.statistics_source === "eos") {
        for (const field of Object.keys(counterNames)) assert.equal(player.statistics[field], row.expected[field], row.name + ": " + field);
        observed = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    } while (Date.now() < deadline);
    assert.ok(observed, row.name + ": accepted result did not reach verified EOS read-back");
    assert.ok(ambiguousReply);
    const sent = jobs.filter(op => op === "publish").length;
    await service.refresh();
    assert.equal(jobs.filter(op => op === "publish").length, sent, "Duplicate refresh re-ingested an unchanged accepted result");
    const cache = new DatabaseSync(state, { readOnly: true });
    try {
      const data = JSON.parse(String(cache.prepare("SELECT data FROM stats WHERE player=?").get(row.player)!.data));
      assert.equal(data.H2_CASUAL_KILLS, 7, "Casual kills crossed playlist boundaries");
      assert.equal(data.H2_CASUAL_PARTY_KILLS, 0);
      if (row.ranked_level !== null) assert.equal(data.H2_RANKED_LEVEL, row.ranked_level, "EOS level differs from the accepted Halo rank");
    } finally { cache.close(); }
    if (!fake && row.ranked_level !== null) {
      let observedRank = false;
      const deadline = Date.now() + 120_000;
      do {
        const reply = await worker.request({ op: "board", board: "H2_RANKED_LEVEL" });
        if (reply.records.some((record: any) => record.user === user && record.score === row.ranked_level)) {
          observedRank = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      } while (Date.now() < deadline);
      assert.ok(observedRank, "Accepted Halo level did not reach the EOS ranked leaderboard");
    }
  } finally { service.close(); db.close(); }
}
// A process/service restart reuses only a revision whose exact values were
// read back. It must neither republish nor lose its public profile source.
const last = cases.at(-1);
const db = new DatabaseSync(last.database, { readOnly: true });
let profileRequests = 0;
const worker = { close() {}, async request(job: any) {
  if (job.op === "board") return { records: [] };
  ++profileRequests;
  throw new Error("Fresh verified revision unexpectedly needs EOS");
} };
const restarted = new EosService(db, "unused", state, boards, worker);
try {
  await restarted.refresh();
  const player: any = { id: last.public, statistics: {} };
  restarted.enrich(player);
  assert.equal(player.statistics_source, "eos");
  assert.equal(player.statistics.matches, 2);
  assert.equal(player.statistics.kills, 12);
  assert.equal(profileRequests, 0);
} finally { restarted.close(); db.close(); }
console.log(JSON.stringify({ passed: true, cases: cases.length, guest_slots_excluded: cases[0].guest_slots,
  ranked_level: last.ranked_level, duplicate_safe: true, restart_preserves_readback: true,
  ambiguous_reply_retry: true, ranked_leaderboard_readback: !fake,
  receipts: cases.map((row: any) => ({ name: row.name, report_sha256: row.report_sha256, expected: row.expected,
    ranked_level: row.ranked_level, guest_slots: row.guest_slots })),
  scope: fake ? "Real master HTTP/ledger to TypeScript publisher with a fake SDK; declared PCR fixtures" : "Real master HTTP/ledger to TypeScript publisher and real EOS SDK for one isolated device-test PUID; declared PCR fixtures, not played native matches" }));
