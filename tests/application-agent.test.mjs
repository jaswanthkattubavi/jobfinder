import test from "node:test";
import assert from "node:assert/strict";
import {
  questionKey,
  isSecretQuestion,
  isSensitiveQuestion,
  reusableAnswer,
  prepareCvText,
  classifyForQueue,
  safeApplicationUrl,
} from "../src/lib/services/application-agent.ts";
const base = {
  fit: 85,
  minFit: 70,
  clearance: "none",
  eligibility: "eligible",
  active: true,
  liveStatus: "live",
  analysed: true,
  missing: 0,
  seniority: 100,
};
test("clearance and expired vacancies override a high fit", () => {
  assert.equal(classifyForQueue({ ...base, clearance: "required", fit: 100 }).verdict, "SKIP");
  assert.equal(classifyForQueue({ ...base, liveStatus: "expired" }).verdict, "SKIP");
  assert.equal(classifyForQueue(base).verdict, "APPLY");
});
test("missing evidence and unanalysed jobs never get APPLY", () => {
  for (const delta of [
    { missing: 1 },
    { analysed: false },
    { clearance: "desirable" },
    { eligibility: "review" },
    { liveStatus: "unknown" },
  ])
    assert.equal(classifyForQueue({ ...base, ...delta }).verdict, "STRETCH");
});
test("answers match whole normalised questions and expire", () => {
  const now = Date.now();
  const a = {
    id: "1",
    question: "LinkedIn URL?",
    answer: "https://linkedin.com/in/example",
    scope: "global",
    confirmed_at: new Date(now).toISOString(),
    expires_at: new Date(now + 1000).toISOString(),
  };
  assert.equal(reusableAnswer("LinkedIn URL", [a], now), a.answer);
  assert.equal(reusableAnswer("Portfolio URL", [a], now), null);
  assert.equal(reusableAnswer("LinkedIn URL", [a], now + 2000), null);
  assert.equal(reusableAnswer("LinkedIn URL", [a, { ...a, answer: "different" }], now), null);
});
test("sponsorship, work permission and sensitive declarations are never global autoanswers", () => {
  for (const q of [
    "Do you need sponsorship?",
    "Right to work in UK?",
    "Expected salary",
    "Years of Python experience",
    "Disability",
    "I agree to the privacy policy",
  ]) {
    assert.ok(isSensitiveQuestion(q), q);
    assert.equal(
      reusableAnswer(q, [
        {
          id: "1",
          question: q,
          answer: "yes",
          scope: "global",
          confirmed_at: "2026-01-01",
          expires_at: "2100-01-01",
        },
      ]),
      null,
    );
  }
  assert.ok(isSecretQuestion("Enter OTP verification code"));
});
test("tailoring preserves every source line and does not introduce JD qualifications", () => {
  const cv =
    "Jane\nSkills\n- Java\n- Python\nExperience\nEngineer — Example (2022–2024)\nBuilt an API.";
  const r = prepareCvText(cv, "Python developer with GraphRAG and PhD");
  assert.ok(r.text.indexOf("- Python") < r.text.indexOf("- Java"));
  assert.deepEqual(r.text.split("\n").sort(), cv.split("\n").sort());
  assert.ok(!r.text.includes("GraphRAG"));
  assert.ok(!r.text.includes("PhD"));
  assert.equal(
    prepareCvText("Original CV without headings", "Python").text,
    "Original CV without headings",
  );
});
test("application URLs reject local destinations, credentials and active content", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://127.0.0.1",
    "https://user:pass@example.com",
    "https://[::1]",
    "https://10.1.2.3",
    "https://foo.local",
  ])
    assert.equal(safeApplicationUrl(url), null, url);
  assert.equal(
    safeApplicationUrl("https://jobs.example.com/role/123"),
    "https://jobs.example.com/role/123",
  );
});
test("question normalization retains negatives and unicode", () => {
  assert.notEqual(
    questionKey("Do you need sponsorship?"),
    questionKey("Do you NOT need sponsorship?"),
  );
  assert.equal(questionKey("  Full name * "), "full name");
});
