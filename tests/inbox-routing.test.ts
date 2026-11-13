import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMail, matchApplication, routeMails, type AppRef, type InboxMail } from "../src/lib/inbox-routing";

const mail = (o: Partial<InboxMail>): InboxMail => ({ id: "m", threadId: "t", from: "Recruiter <jobs@acme.com>", subject: "", date: "Mon, 10 Nov 2026 10:00:00 +0000", snippet: "", ...o });
const apps: AppRef[] = [
  { id: "a1", company: "Acme", title: "Account Executive", stage: "applied" },
  { id: "a2", company: "Globex Technologies", title: "SDR", stage: "applied" },
];

test("mail kinds are told apart, and a rejection beats the word interview", () => {
  assert.equal(classifyMail("Your application", "Unfortunately we will not be moving forward after the interview"), "rejection");
  assert.equal(classifyMail("Next steps", "We'd like to schedule a call this week"), "interview");
  assert.equal(classifyMail("Offer", "We are pleased to offer you the role"), "offer");
  assert.equal(classifyMail("Quick task", "Please complete this take-home"), "assessment");
  assert.equal(classifyMail("Thank you for applying", "We have received your application"), "received");
  assert.equal(classifyMail("Newsletter", "Ten tips for your week"), "other");
});

test("a mail is routed to the application whose company is the sender", () => {
  const m = mail({ from: "Priya at Acme <priya@acme.com>", subject: "Let's schedule a call" });
  assert.equal(matchApplication(m, apps)?.id, "a1");
});

test("a company name in the body also routes it, ignoring words like Technologies", () => {
  const m = mail({ from: "hr@talentfirm.io", subject: "Globex SDR role", snippet: "Globex would like to speak with you" });
  assert.equal(matchApplication(m, apps)?.id, "a2");
});

test("a mail that matches nothing is not forced onto an application", () => {
  assert.equal(matchApplication(mail({ from: "news@random.com", subject: "Weekly digest" }), apps), null);
});

test("a mail naming two different companies equally is left unrouted", () => {
  const m = mail({ from: "hr@agency.com", subject: "Acme and Globex openings", snippet: "" });
  assert.equal(matchApplication(m, apps), null);
});

test("suggested stage follows the mail, never backwards, and only with a matched application", () => {
  const [r1] = routeMails([mail({ from: "x@acme.com", subject: "Schedule a call", snippet: "interview" })], apps);
  assert.equal(r1.suggestedStage, "interview");
  const [r2] = routeMails([mail({ from: "x@acme.com", subject: "Schedule a call" })], [{ ...apps[0], stage: "final" }]);
  assert.equal(r2.suggestedStage, null);
  const [r3] = routeMails([mail({ from: "x@acme.com", subject: "Unfortunately", snippet: "not moving forward" })], [{ ...apps[0], stage: "final" }]);
  assert.equal(r3.suggestedStage, "rejected");
  const [r4] = routeMails([mail({ from: "x@unknown.com", subject: "Schedule a call" })], apps);
  assert.equal(r4.suggestedStage, null);
});

test("newest mail comes first", () => {
  const out = routeMails([mail({ id: "old", date: "Mon, 3 Nov 2026 10:00:00 +0000" }), mail({ id: "new", date: "Mon, 10 Nov 2026 10:00:00 +0000" })], apps);
  assert.deepEqual(out.map((m) => m.id), ["new", "old"]);
});

import { keepRepliesAndInvites } from "../src/lib/inbox-routing";

test("calendar invitations are recognised and suggest the interview stage for a matched application", () => {
  assert.equal(classifyMail("Invitation: Intro call with Acme @ Tue 11am", ""), "invite");
  assert.equal(classifyMail("Updated invitation: Intro call", ""), "invite");
  const [r] = routeMails([mail({ from: "priya@acme.com", subject: "Invitation: Intro call @ Tue" })], apps);
  assert.equal(r.kind, "invite");
  assert.equal(r.suggestedStage, "interview");
});

test("the Replies page keeps replies and invites without repeats", () => {
  const out = keepRepliesAndInvites([mail({ id: "r1" }), mail({ id: "x" })], [mail({ id: "x" }), mail({ id: "i1" })]);
  assert.deepEqual(out.map((m) => m.id), ["r1", "x", "i1"]);
});

import { isCalendarInvite } from "../src/lib/inbox-routing";

test("only real calendar invitations count as invites, not marketing mail with the word in it", () => {
  assert.equal(isCalendarInvite("Invitation: Intro call @ Tue 11am (IST)", "priya@acme.com"), true);
  assert.equal(isCalendarInvite("Updated invitation: Intro call", "priya@acme.com"), true);
  assert.equal(isCalendarInvite("Accepted: Intro call", "priya@acme.com"), true);
  assert.equal(isCalendarInvite("Dubai Business Exchange: 🔒 By Invitation Only 🔒", "Sheila M (Meetup) <info@meetup.com>"), false);
  assert.equal(isCalendarInvite("You're invited to our webinar", "news@brand.com"), false);
});

test("words many companies share do not match a mail to the wrong application", () => {
  const grimbell: AppRef = { id: "g", company: "Grimbell Business Solutions", title: "Sales Development Representative", stage: "applied" };
  const m = mail({ from: "Sheila M (Meetup) <info@meetup.com>", subject: "Dubai Business Exchange: By Invitation Only", snippet: "Business networking" });
  assert.equal(matchApplication(m, [grimbell]), null);
  assert.equal(matchApplication(mail({ from: "hr@grimbell.com", subject: "Your application" }), [grimbell])?.id, "g");
});
