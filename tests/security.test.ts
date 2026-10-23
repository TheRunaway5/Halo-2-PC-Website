import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RequestBudgets } from "../scripts/request-budgets.ts";

test("a full bridge limiter releases expired identities at the reset boundary", () => {
  const budgets = new RequestBudgets();
  for (let i = 0; i < 10000; i++) assert.equal(budgets.consume(String(i), 0), 200);
  assert.equal(budgets.consume("unseen", 59999), 503);
  assert.equal(budgets.consume("unseen", 60000), 200);
  for (let i = 0; i < 9999; i++) assert.equal(budgets.consume(`next-${i}`, 60000), 200);
  assert.equal(budgets.consume("again", 120000), 200);
});

test("bridge request limits survive capacity pressure and recover after expiry", () => {
  const budgets = new RequestBudgets();
  for (let i = 0; i < 90; i++) assert.equal(budgets.consume("busy", 0), 200);
  assert.equal(budgets.consume("busy", 59999), 429);
  assert.equal(budgets.consume("other", 59999), 200);
  assert.equal(budgets.consume("busy", 60000), 200);
});

test("all Pages workflow actions use immutable full commit references", () => {
  const workflow = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  const actions = [...workflow.matchAll(/uses:\s+([^\s]+)/g)];
  assert.equal(actions.length, 4);
  for (const [, action] of actions) assert.match(action, /^actions\/[a-z-]+@[a-f0-9]{40}$/);
  assert.match(workflow, /deploy:\s+needs: build/);
  assert.match(workflow, /permissions:\s+pages: write\s+id-token: write/);
});
