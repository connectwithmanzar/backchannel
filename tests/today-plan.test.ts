import { test } from "node:test";
import assert from "node:assert/strict";
import { daysSince, goalProgress, todayCards, waitingList, type TodayFacts } from "../src/lib/today-plan";

const none: TodayFacts = { topTarget: null, priorityJob: null, draftMessages: 0, needsYou: 0, readyToSend: 0 };
const NOW = Date.parse("2026-11-15T12:00:00Z");

test("with nothing going on, the cards point you to Swipe and Messages", () => {
  const [a, b, c] = todayCards(none);
  assert.equal(a.href, "/swipe");
  assert.equal(b.title, "No messages waiting");
  assert.equal(c.href, "/swipe");
  assert.deepEqual([a.n, b.n, c.n], [1, 2, 3]);
});

test("the first card asks for a referral at your target, before a plain priority role", () => {
  const [a] = todayCards({ ...none, topTarget: { company: "Harvey", title: "Account Executive" }, priorityJob: { company: "Other", title: "SDR" } });
  assert.match(a.title, /Harvey/);
  assert.match(a.href, /^\/referrals\?company=Harvey&role=Account%20Executive/);
  const [b] = todayCards({ ...none, priorityJob: { company: "Other Co", title: "SDR" } });
  assert.match(b.title, /Other Co/);
});

test("approve and apply cards count real things and use the right words for one or many", () => {
  const one = todayCards({ ...none, draftMessages: 1, needsYou: 1 });
  assert.equal(one[1].title, "1 message is ready for you");
  assert.equal(one[2].title, "1 application needs your answer");
  const many = todayCards({ ...none, draftMessages: 3, needsYou: 12 });
  assert.equal(many[1].title, "3 messages are ready for you");
  assert.equal(many[2].title, "12 applications need your answer");
  assert.match(many[2].href, /show=needs_you/);
});

test("prepared applications show when none need you", () => {
  assert.equal(todayCards({ ...none, readyToSend: 2 })[2].title, "2 applications are prepared");
});

test("waiting items are oldest first, limited, and messages are nudged from day 3", () => {
  const out = waitingList([
    { kind: "message", label: "Email · Flipkart", sentAt: "2026-11-12T12:00:00Z" },
    { kind: "application", label: "HubSpot", sentAt: "2026-11-10T12:00:00Z" },
    { kind: "message", label: "Ask · Salesforce", sentAt: "2026-11-14T12:00:00Z" },
    { kind: "message", label: "never sent", sentAt: null },
  ], NOW);
  assert.deepEqual(out.map((o) => o.label), ["HubSpot", "Email · Flipkart", "Ask · Salesforce"]);
  assert.equal(out[0].note, "sent 5 days ago");
  assert.equal(out[1].note, "sent 3 days ago · follow-up due");
  assert.equal(out[2].note, "sent yesterday");
  assert.equal(waitingList(Array.from({ length: 9 }, (_, i) => ({ kind: "message" as const, label: String(i), sentAt: "2026-11-01T00:00:00Z" })), NOW, 5).length, 5);
});

test("days since handles bad and future dates, and the goal stays between 0 and 100", () => {
  assert.equal(daysSince(null, NOW), 0);
  assert.equal(daysSince("garbage", NOW), 0);
  assert.equal(daysSince("2026-12-01T00:00:00Z", NOW), 0);
  assert.deepEqual(goalProgress(5, 20), { done: 5, goal: 20, percent: 25 });
  assert.equal(goalProgress(50, 20).percent, 100);
  assert.equal(goalProgress(-3, 20).done, 0);
});
