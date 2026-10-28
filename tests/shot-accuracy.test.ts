import { test } from "node:test";
import assert from "node:assert/strict";
import { shotAccuracy } from "../lib/shot-accuracy.ts";
import { formatCount } from "../lib/format-count.ts";

const base = { matches: 2, wins: 1, kills: 7, deaths: 2, assists: 3,
  shots: 100, hits: 1, accuracy_matches: 2, accuracy_complete: true };

test("profile accuracy uses the cumulative hit/shot ratio", () => {
  assert.deepEqual(shotAccuracy(base), { value: "1.0%", tooltip: "1 hit · 99 misses · 100 shots", coverage: null });
});
test("known zero-shot matches never show NaN or a fabricated percentage", () => {
  const result = shotAccuracy({ ...base, shots: 0, hits: 0 });
  assert.equal(result.value, "—");assert.equal(result.tooltip, "0 hits · 0 misses · 0 shots");
});
test("old results keep missing accuracy distinct from zero accuracy", () => {
  const result = shotAccuracy({ ...base, shots: 0, hits: 0, accuracy_matches: 0, accuracy_complete: false });
  assert.equal(result.value, "—");assert.equal(result.tooltip, null);
  assert.equal(result.coverage, "Accuracy covers 0 of 2 recorded matches.");
  assert.equal(shotAccuracy({ ...base, accuracy_matches: 1, accuracy_complete: false }).coverage,
    "Accuracy covers 1 of 2 recorded matches.");
});
test("partial original recording windows retain literal source counts", () => {
  assert.equal(shotAccuracy({ ...base, shots: 10, hits: 11 }).value, "110.0%");
  assert.equal(shotAccuracy({ ...base, shots: 10, hits: 11 }).tooltip, "11 hits · Misses not recorded · 10 shots");
  assert.equal(shotAccuracy({ ...base, shots: 0, hits: 1 }).value, "—");
});
test("large profile and tooltip counts use compact suffixes", () => {
  for (const [value, expected] of [[999, "999"], [1000, "1K"], [10700, "10.7K"], [999999, "1M"], [1200000, "1.2M"], [1200000000, "1.2B"]] as const)
    assert.equal(formatCount(value), expected);
  assert.equal(shotAccuracy({ ...base, shots: 1200000, hits: 10700 }).tooltip,
    "10.7K hits · 1.2M misses · 1.2M shots");
});
