import test from "node:test";
import assert from "node:assert/strict";
import { aiAnalysisLimit } from "../src/lib/services/analysis-budget.ts";
test("daily AI budget supports zero and a hard ceiling", () => {
  assert.equal(aiAnalysisLimit("0"), 0);
  assert.equal(aiAnalysisLimit("5"), 5);
  assert.equal(aiAnalysisLimit("900"), 30);
});
test("invalid AI budgets fail closed rather than spending unexpectedly", () => {
  for (const input of ["", "-1", "2.5", "NaN", "Infinity", "oops"])
    assert.equal(aiAnalysisLimit(input), 0);
  assert.equal(aiAnalysisLimit(undefined), 30);
});
