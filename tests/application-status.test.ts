import { test } from "node:test";
import assert from "node:assert/strict";
import { detailOf, groupOf, summarise, timeSavedText, type AppFacts } from "../src/lib/application-status";

const app = (o: Partial<AppFacts>): AppFacts => ({ status: "awaiting_approval", stage: "applied", auto_status: null, auto_log: null, ...o });

test("a prepared application that was not sent is in progress", () => {
  assert.equal(groupOf(app({})), "in_progress");
  assert.equal(detailOf(app({})), "Prepared, not sent yet.");
});

test("the robot's states are in progress until it needs you or sends", () => {
  for (const s of ["queued", "running", "filled"]) assert.equal(groupOf(app({ auto_status: s })), "in_progress", s);
  assert.equal(groupOf(app({ auto_status: "needs_you" })), "needs_you");
  assert.equal(groupOf(app({ auto_status: "failed" })), "needs_you");
  assert.equal(groupOf(app({ auto_status: "submitted", status: "awaiting_approval" })), "submitted");
});

test("an unanswered sensitive question needs you", () => {
  const a = app({ status: "needs_answer" });
  assert.equal(groupOf(a), "needs_you");
  assert.match(detailOf(a), /visa, salary or notice period/);
});

test("the stage you move it to wins over the send status", () => {
  assert.equal(groupOf(app({ status: "submitted", stage: "interview" })), "interview");
  assert.equal(groupOf(app({ status: "submitted", stage: "screening" })), "interview");
  assert.equal(groupOf(app({ status: "submitted", stage: "offer" })), "offer");
  assert.equal(groupOf(app({ status: "submitted", stage: "rejected" })), "closed");
  assert.equal(groupOf(app({ status: "skipped" })), "closed");
});

test("a failed robot run shows the last line of its log", () => {
  const a = app({ auto_status: "failed", auto_log: "opened form\nCould not find the resume upload button" });
  assert.equal(detailOf(a), "Could not find the resume upload button");
});

test("the summary counts each group and estimates time saved from sent ones only", () => {
  const s = summarise([
    app({ status: "submitted" }),
    app({ status: "submitted", stage: "interview" }),
    app({ auto_status: "queued" }),
    app({ status: "needs_answer" }),
    app({ status: "submitted", stage: "rejected" }),
  ]);
  assert.equal(s.counts.submitted, 1);
  assert.equal(s.counts.interview, 1);
  assert.equal(s.counts.in_progress, 1);
  assert.equal(s.counts.needs_you, 1);
  assert.equal(s.counts.closed, 1);
  assert.equal(s.sent, 3); // the rejected one was still sent
  assert.equal(s.minutesSaved, 36);
});

test("time saved reads naturally", () => {
  assert.equal(timeSavedText(0), "0 min");
  assert.equal(timeSavedText(45), "45 min");
  assert.equal(timeSavedText(120), "2 h");
  assert.equal(timeSavedText(150), "2 h 30 min");
});
