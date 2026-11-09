import { test } from "node:test";
import assert from "node:assert/strict";
import { roleFamily, detectMarket, parsePay, detectRemoteType, detectVisa, normalise } from "../src/lib/jobs/process";
import { parseAshby, parseLever, parseGreenhouse, slugCandidates } from "../src/lib/collectors/ats";
import { toMarket, countryToMarkets } from "../src/lib/jobs/market";
import { matchSensitive } from "../src/lib/apps/prepare";
import { parseJsonLoose } from "../src/lib/ai";
import { buildMime } from "../src/lib/outreach/gmail";
import { inSendWindow } from "../src/lib/outreach/engine";

test("sales role filter: keeps targets, drops noise", () => {
  assert.equal(roleFamily("Senior Sales Development Representative, EMEA"), "SDR/BDR");
  assert.equal(roleFamily("Founding BDR"), "SDR/BDR");
  assert.equal(roleFamily("GTM Engineer"), "GTM Engineer");
  assert.equal(roleFamily("Account Executive, Mid-Market"), "Account Executive");
  assert.equal(roleFamily("Manager, Sales Development"), "Sales leadership");
  for (const t of ["Sales Engineer", "Customer Success Manager", "Technical Recruiter", "Senior Software Engineer", "Product Marketing Manager"]) assert.equal(roleFamily(t), null, t);
});

test("market keeps the country even for remote roles", () => {
  assert.equal(detectMarket("Remote - India"), "India");
  assert.equal(detectMarket("London, UK"), "UK");
  assert.equal(detectMarket("Austin, TX"), "US");
  assert.equal(detectMarket("Brussels, Belgium"), "Europe");
  assert.equal(detectMarket("Remote"), "Remote");
  assert.equal(toMarket("India", "remote"), "remote-in");
  assert.equal(toMarket("UK", "hybrid"), "emea");
  assert.deepEqual(countryToMarkets("India"), ["india", "remote-in"]);
});

test("pay, remote and visa detection", () => {
  assert.deepEqual(parsePay("OTE: $120,000 - $150,000"), { currency: "USD", min: 120000, max: 150000, isOte: true });
  assert.equal(parsePay("₹12L - ₹18L").min, 1200000);
  assert.equal(parsePay("Base salary €45k – €55k").isOte, false);
  assert.equal(detectRemoteType("Remote, US", false), "remote");
  assert.equal(detectRemoteType("London (Hybrid)", false), "hybrid");
  assert.equal(detectVisa("We are unable to sponsor visas."), "no");
  assert.equal(detectVisa("Visa sponsorship is available."), "yes");
});

test("Ashby parser reads the current API shape with structured pay", () => {
  const jobs = parseAshby({ jobs: [
    { id: "a", title: "BDR", location: "Bengaluru", isRemote: false, jobUrl: "https://x/a", descriptionHtml: "<p>Hi</p>", publishedAt: "2026-11-01",
      compensation: { summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 50000, maxValue: 70000 }] } },
    { id: "b", title: "Hidden", isListed: false },
  ] });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].base_max, 70000);
  assert.equal(jobs[0].pay_verified, true);
  const n = normalise(jobs[0], "Acme");
  assert.equal(n.pay_band_status, "verified");
  assert.equal(n.market, "India");
});

test("Lever and Greenhouse parsers keep descriptions", () => {
  const lv = parseLever([{ id: "1", text: "Account Executive", categories: { location: "Dublin" }, hostedUrl: "u", description: "<p>Sell</p>", lists: [{ text: "You", content: "<li>Gong</li>" }], salaryRange: { currency: "EUR", min: 60000, max: 80000, interval: "per-year-salary" } }]);
  assert.match(lv[0].description, /Gong/);
  assert.equal(lv[0].base_min, 60000);
  const gh = parseGreenhouse({ jobs: [{ id: 9, title: "SDR", location: { name: "Remote" }, absolute_url: "u", content: "&lt;p&gt;Book meetings&lt;/p&gt;" }] });
  assert.equal(normalise(gh[0], "Co").description, "Book meetings");
});

test("slug guesses for board discovery", () => {
  assert.ok(slugCandidates("Apollo.io", "apollo.io").includes("apolloio"));
  assert.ok(slugCandidates("dbt Labs", "getdbt.com").includes("dbtlabs"));
});

test("sensitive application questions are detected", () => {
  assert.equal(matchSensitive("Will you now or in the future require visa sponsorship?"), "visa_sponsorship");
  assert.equal(matchSensitive("What are your salary expectations?"), "salary_expectation");
  assert.equal(matchSensitive("What is your notice period?"), "notice_period");
  assert.equal(matchSensitive("Describe your outbound process"), null);
});

test("AI JSON parsing tolerates fences and chatter", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":[1,2]} hope that helps'), { a: [1, 2] });
});

test("email MIME is valid base64url with UTF-8 subject", () => {
  const raw = buildMime({ from: "me@x.com", to: "you@y.com", subject: "Quick idea – Q1", body: "Hi ✓" });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /^From: me@x.com/);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
});

test("send window: Mon-Fri 9:00-18:00 IST, and the daily cron fires inside it", () => {
  assert.equal(inSendWindow(new Date("2026-11-10T03:30:00Z")), true);  // Tue 09:00 IST, start is inclusive
  assert.equal(inSendWindow(new Date("2026-11-10T05:00:00Z")), true);  // Tue 10:30 IST, the daily cron
  assert.equal(inSendWindow(new Date("2026-11-10T12:30:00Z")), false); // Tue 18:00 IST, end is exclusive
  assert.equal(inSendWindow(new Date("2026-11-10T01:45:00Z")), false); // Tue 07:15 IST, the old cron time
  assert.equal(inSendWindow(new Date("2026-11-14T05:00:00Z")), false); // Saturday
});
