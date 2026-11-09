import { test } from "node:test";
import assert from "node:assert/strict";
import { roleFamily, detectMarket, parsePay, detectRemoteType, detectVisa, normalise } from "../src/lib/jobs/process";
import { parseAshby, parseLever, parseGreenhouse, slugCandidates } from "../src/lib/collectors/ats";
import { toMarket, countryToMarkets } from "../src/lib/jobs/market";
import { matchSensitive } from "../src/lib/apps/prepare";
import { parseJsonLoose } from "../src/lib/ai";
import { buildMime } from "../src/lib/outreach/gmail";
import { inSendWindow } from "../src/lib/outreach/engine";
import { trackOf, weeklyFunnel } from "../src/lib/funnel";
import { parseJobUrl, buildPastedJob } from "../src/lib/jobs/paste";
import { scoreJob, parseMinOteByMarket, type SearchProfile } from "../src/lib/score";
import { companyQuality, signalsFromRows } from "../src/lib/companyQuality";
import type { Job } from "../src/lib/collector/types";

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

test("tracks: India and Gulf are fast, the rest stretch", () => {
  for (const m of ["India", "UAE", "Saudi Arabia", "Qatar"]) assert.equal(trackOf(m), "fast", m);
  for (const m of ["US", "UK", "Europe", "Remote", null, undefined]) assert.equal(trackOf(m), "stretch", String(m));
});

test("weekly funnel: this week vs last week, reply rate per 100 emails", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const at = (daysAgo: number) => new Date(now - daysAgo * 864e5).toISOString();
  const events = [
    { type: "outreach_sent", occurred_at: at(1) }, { type: "outreach_sent", occurred_at: at(2) },
    { type: "outreach_sent", occurred_at: at(3) }, { type: "outreach_sent", occurred_at: at(4) },
    { type: "reply", occurred_at: at(1) }, { type: "interview", occurred_at: at(2) },
    { type: "outreach_sent", occurred_at: at(9) }, { type: "applied", occurred_at: at(10) },
    { type: "applied", occurred_at: at(20) },
  ];
  const f = weeklyFunnel(events, now);
  assert.equal(f.thisWeek.sent, 4);
  assert.equal(f.thisWeek.replies, 1);
  assert.equal(f.replyRate, 25);
  assert.equal(f.thisWeek.interviews, 1);
  assert.equal(f.lastWeek.sent, 1);
  assert.equal(f.lastWeek.applied, 1);
  assert.equal(weeklyFunnel([], now).replyRate, null);
});

test("paste-a-job: only public ATS links are fetched, never LinkedIn or Naukri", () => {
  const ok = parseJobUrl("https://jobs.lever.co/acme/123");
  assert.deepEqual(ok, { ok: true, url: "https://jobs.lever.co/acme/123", fetchable: true });
  for (const u of ["https://www.linkedin.com/jobs/view/1", "https://www.naukri.com/job-listings-x", "https://wellfound.com/jobs/1"]) {
    const r = parseJobUrl(u);
    assert.equal(r.ok && r.fetchable, false, u);
  }
  assert.equal(parseJobUrl("http://jobs.lever.co/acme/1").ok, false);
  assert.equal(parseJobUrl("not a url").ok, false);
  assert.equal(parseJobUrl("https://169.254.169.254/latest").ok && (parseJobUrl("https://169.254.169.254/latest") as { fetchable: boolean }).fetchable, false);
});

test("paste-a-job: row belongs to one user and hashes differently per user", () => {
  const f = { title: "Senior SDR", company: "Acme", location: "Remote, India" };
  const text = "Senior SDR at Acme. Remote in India. Base pay INR 1800000 - 2400000. Own outbound to mid-market.";
  const a = buildPastedJob("user-a", f, text, null);
  const b = buildPastedJob("user-b", f, text, null);
  assert.equal(a.added_by, "user-a");
  assert.equal(a.source, "pasted");
  assert.equal(a.company_id, null);
  assert.equal(a.company_name, "Acme");
  assert.equal(a.source_type, "public");
  assert.notEqual(a.dedupe_hash, b.dedupe_hash);
  assert.equal(a.market, "India");
});

const baseProfile: SearchProfile = { name: "T", targetFamilies: ["SDR/BDR"], markets: ["us", "india"], tools: [], minOteUsd: 50000, prefersRemote: false };
const baseJob: Job = {
  id: "j", company: "Acme", title: "SDR", location: "Austin", remoteType: "onsite", market: "us", sourceType: "careers", board: "greenhouse",
  url: "", lastCheckedAt: "2026-11-10T00:00:00Z", currency: "USD", payMin: 40000, payMax: 60000, payBandStatus: "verified", visaSponsorship: "unknown",
  roleFamily: "SDR/BDR", description: "",
};

test("pay floor can differ by market", () => {
  const withUsFloor = { ...baseProfile, minOteByMarket: { us: 90000 } as SearchProfile["minOteByMarket"] };
  assert.equal(scoreJob(baseJob, baseProfile).parts.find((p) => p.label === "Pay")?.value, 100);      // 60k >= 50k default
  assert.equal(scoreJob(baseJob, withUsFloor).parts.find((p) => p.label === "Pay")?.value, 10);       // 60k < 90k for the US
  assert.equal(scoreJob({ ...baseJob, market: "india" }, withUsFloor).parts.find((p) => p.label === "Pay")?.value, 100); // India keeps the default
});

test("saved per-market minimums ignore junk", () => {
  assert.deepEqual(parseMinOteByMarket({ us: 90000, india: "40000", mars: 5, emea: -1, global: "abc" }), { us: 90000, india: 40000 });
  assert.deepEqual(parseMinOteByMarket(null), {});
});

test("company quality rises with hiring and pay transparency", () => {
  assert.equal(companyQuality(undefined), 50);
  const one = companyQuality({ openSalesRoles: 1, payShare: 0 });
  const five = companyQuality({ openSalesRoles: 5, payShare: 1 });
  assert.ok(five > one);
  assert.equal(five, 100);
  const sig = signalsFromRows([{ company_id: "a", ote_max: 1 }, { company_id: "a" }, { company_id: null, ote_max: 5 }]);
  assert.deepEqual(sig.get("a"), { openSalesRoles: 2, payShare: 0.5 });
  assert.equal(sig.size, 1);
});

test("score weights still add up: strong company lifts the score", () => {
  const lo = scoreJob({ ...baseJob, companyQuality: 10 }, baseProfile).score;
  const hi = scoreJob({ ...baseJob, companyQuality: 100 }, baseProfile).score;
  assert.ok(hi > lo);
});
