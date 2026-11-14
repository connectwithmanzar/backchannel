import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, hasReceipt, providerLabel, type ReceiptInput } from "../src/lib/receipt";

const base: ReceiptInput = { url: "https://boards.greenhouse.io/acme/jobs/1", status: "submitted", auto_status: null, submitted_at: "2026-11-13T10:00:00Z", receipt: null, tailored_cv: "cv text", cover_note: "Hello there", questions: [] };

test("the provider is read from the link, and unknown sites are named plainly", () => {
  assert.equal(providerLabel("https://boards.greenhouse.io/acme/jobs/1"), "Greenhouse");
  assert.equal(providerLabel("https://jobs.lever.co/acme/abc"), "Lever");
  assert.equal(providerLabel("https://acme.wd1.myworkdayjobs.com/en/careers"), "Workday");
  assert.equal(providerLabel("https://careers.acme.com/role"), "the company's own site");
  assert.equal(providerLabel(null), "the company's site");
  assert.equal(providerLabel("not a url"), "the company's site");
});

test("only sent or filled applications have a receipt", () => {
  assert.equal(hasReceipt({ status: "submitted", auto_status: null }), true);
  assert.equal(hasReceipt({ status: "awaiting_approval", auto_status: "filled" }), true);
  assert.equal(hasReceipt({ status: "awaiting_approval", auto_status: "queued" }), false);
  assert.equal(buildReceipt({ ...base, status: "awaiting_approval" }), null);
});

test("the receipt lists the CV, the cover note and each answer, counting filled ones", () => {
  const r = buildReceipt({ ...base, questions: [{ q: "Why Acme?", answer: "Because of the product." }, { q: "Notice period?", answer: "30 days", sensitive: true }, { q: "Anything else?", answer: "" }] })!;
  assert.equal(r.provider, "Greenhouse");
  assert.equal(r.total, 5);
  assert.equal(r.filled, 4);
  assert.equal(r.items[0].detail, "Tailored for this role (ATS-friendly PDF)");
  assert.equal(r.items[3].fromSaved, true);
  assert.equal(r.items[4].filled, false);
  assert.equal(r.items[4].detail, "No answer on record");
});

test("a standard CV and a missing cover note are stated honestly", () => {
  const r = buildReceipt({ ...base, tailored_cv: null, cover_note: null })!;
  assert.equal(r.items[0].detail, "Your standard CV");
  assert.equal(r.items[1].filled, false);
  assert.equal(r.filled, 1);
});

test("long text is trimmed and the confirmation number is kept", () => {
  const r = buildReceipt({ ...base, receipt: " ABC-123 ", cover_note: "x".repeat(400) })!;
  assert.equal(r.confirmation, "ABC-123");
  assert.ok(r.items[1].detail.length <= 140);
});
