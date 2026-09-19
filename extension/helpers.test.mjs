import test from "node:test";
import assert from "node:assert/strict";
import { validatePacket, reusableAnswers, sameApplicationUrl, normalize } from "./helpers.mjs";
const packet = () => ({
  version: 1,
  taskId: "task-1",
  job: { title: "Engineer", company: "Example", applyUrl: "https://example.com/apply?job=123" },
  cvText: "Verified CV",
  answers: [{ question: "First name", answer: "Alex", scope: "global", reuse: true }],
});
test("binds application to origin, role path, query and hash", () => {
  assert.ok(
    sameApplicationUrl("https://example.com/apply?job=123&utm_source=test", packet().job.applyUrl),
  );
  for (const url of [
    "https://evil.test/apply?job=123",
    "http://example.com/apply?job=123",
    "https://example.com/other?job=123",
    "https://example.com/apply?job=456",
    "https://example.com/apply?job=123&job=456",
  ])
    assert.equal(sameApplicationUrl(url, packet().job.applyUrl), false);
  assert.equal(sameApplicationUrl("https://example.com/#job2", "https://example.com/#job1"), false);
  assert.equal(sameApplicationUrl("http://example.com/apply", "http://example.com/apply"), false);
});
test("rejects conflicting normalized answers and malformed packets", () => {
  const p = packet();
  p.answers.push({ ...p.answers[0], question: " FIRST NAME: ", answer: "Different" });
  assert.throws(() => validatePacket(p), /Conflicting/);
  assert.throws(() => validatePacket({ ...packet(), version: 2 }));
  assert.throws(() =>
    validatePacket({ ...packet(), job: { ...packet().job, applyUrl: "javascript:alert(1)" } }),
  );
  assert.throws(
    () =>
      validatePacket({
        ...packet(),
        job: { ...packet().job, applyUrl: "http://example.com/apply" },
      }),
    /HTTPS/,
  );
});
test("honours optional expiry and rejects stale or invalid packets", () => {
  assert.ok(validatePacket(packet()));
  assert.ok(validatePacket({ ...packet(), expiresAt: new Date(Date.now() + 60000).toISOString() }));
  for (const expiresAt of ["bad-date", new Date(Date.now() - 1).toISOString(), null, 123])
    assert.throws(() => validatePacket({ ...packet(), expiresAt }), /expiry|expired/);
});
test("never reuses unapproved or another application answers", () => {
  const p = packet();
  p.answers.push(
    { question: "Salary", answer: "50000", scope: "task-2", reuse: true },
    { question: "Address", answer: "Private", scope: "global", reuse: false },
  );
  assert.equal(reusableAnswers(validatePacket(p)).length, 1);
  assert.equal(normalize(" First   name: * "), "first name");
});
