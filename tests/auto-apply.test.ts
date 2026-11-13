import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFormProfile, checkQueueable, clampAutoCap, cleanAutoMode, fillSavedAnswers, isAutoResult, isStale, missingProfileDetails, remainingToday, splitName } from "../src/lib/auto-apply";

const visa = { q: "Do you need visa sponsorship?", answer: "", sensitive: true, key: "visa_sponsorship" };
const why = { q: "Why this company?", answer: "Because of X.", sensitive: false };

test("modes and results are checked, anything else means off or invalid", () => {
  assert.equal(cleanAutoMode("submit"), "submit");
  assert.equal(cleanAutoMode("dry_run"), "dry_run");
  assert.equal(cleanAutoMode("whatever"), "off");
  assert.equal(cleanAutoMode(undefined), "off");
  assert.equal(isAutoResult("submitted"), true);
  assert.equal(isAutoResult("done"), false);
});

test("the daily cap is a whole number from 1 to 100, 20 when unclear", () => {
  assert.equal(clampAutoCap(500), 100);
  assert.equal(clampAutoCap(0), 1);
  assert.equal(clampAutoCap("40"), 40);
  assert.equal(clampAutoCap("abc"), 20);
  assert.equal(remainingToday(20, 5), 15);
  assert.equal(remainingToday(20, 30), 0);
});

test("names split into first and last", () => {
  assert.deepEqual(splitName("Manzar Imam"), { first: "Manzar", last: "Imam" });
  assert.deepEqual(splitName("  Ana  Maria  Lopez "), { first: "Ana", last: "Maria Lopez" });
  assert.deepEqual(splitName("Cher"), { first: "Cher", last: "" });
  assert.deepEqual(splitName(null), { first: "", last: "" });
});

test("saved answers fill sensitive questions only with standing approval, and never invent one", () => {
  const saved = { visa_sponsorship: "No, I do not need sponsorship." };
  assert.equal(fillSavedAnswers([visa], saved, false)[0].answer, "");
  assert.equal(fillSavedAnswers([visa], saved, true)[0].answer, "No, I do not need sponsorship.");
  const salary = { q: "Salary expectations?", answer: "", sensitive: true, key: "salary_expectation" };
  assert.equal(fillSavedAnswers([salary], saved, true)[0].answer, "");
  assert.equal(fillSavedAnswers([why], saved, true)[0].answer, "Because of X.");
});

test("an application is queueable only when every sensitive question has your answer", () => {
  const saved = { visa_sponsorship: "No." };
  assert.equal(checkQueueable({ status: "needs_answer", questions: [visa, why] }, "submit", false, saved).ok, false);
  assert.equal(checkQueueable({ status: "needs_answer", questions: [visa, why] }, "submit", true, saved).ok, true);
  assert.equal(checkQueueable({ status: "awaiting_approval", questions: [{ ...visa, answer: "No." }, why] }, "dry_run", false, {}).ok, true);
  const off = checkQueueable({ status: "awaiting_approval", questions: [why] }, "off", true, saved);
  assert.equal(off.ok, false);
  assert.match(off.reason ?? "", /switched off/);
  assert.equal(checkQueueable({ status: "submitted", questions: [] }, "submit", true, saved).ok, false);
  const blocked = checkQueueable({ status: "needs_answer", questions: [visa] }, "submit", false, {});
  assert.match(blocked.reason ?? "", /visa sponsorship/);
});

test("the form profile comes from your profile, email and saved details, and says what is missing", () => {
  const p = buildFormProfile({ name: "Manzar Imam", cv_text: "x".repeat(300) }, " me@example.com ", { contact_phone: "+91 98000 00000", contact_city: "Pune, India" });
  assert.equal(p.first_name, "Manzar");
  assert.equal(p.last_name, "Imam");
  assert.equal(p.email, "me@example.com");
  assert.equal(p.phone, "+91 98000 00000");
  assert.deepEqual(missingProfileDetails(p), []);
  const empty = buildFormProfile(null, "", {});
  assert.deepEqual(missingProfileDetails(empty), ["your name (on your profile)", "your email", "phone number", "current city and country", "your CV (on your profile)"]);
});

test("a running job counts as stuck after 30 minutes", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  assert.equal(isStale("2026-11-13T11:45:00Z", now), false);
  assert.equal(isStale("2026-11-13T11:20:00Z", now), true);
  assert.equal(isStale(null, now), true);
});
