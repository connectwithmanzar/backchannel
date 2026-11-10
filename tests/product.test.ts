import { test } from "node:test";
import assert from "node:assert/strict";
import { roleFamily, detectMarket, parsePay, detectRemoteType, detectVisa, normalise } from "../src/lib/jobs/process";
import { parseAshby, parseLever, parseGreenhouse, slugCandidates } from "../src/lib/collectors/ats";
import { toMarket, countryToMarkets } from "../src/lib/jobs/market";
import { matchSensitive } from "../src/lib/apps/prepare";
import { parseJsonLoose } from "../src/lib/ai";
import { buildMime } from "../src/lib/outreach/gmail";
import { recipientTimezone, knownRecipientTimezone, inRecipientWindow } from "../src/lib/outreach/timezone";
import { trackOf, weeklyFunnel } from "../src/lib/funnel";
import { parseJobUrl, buildPastedJob } from "../src/lib/jobs/paste";
import { scoreJob, parseMinOteByMarket, familiesFromTitles, mentions, buildSearchProfile, toUsd, type SearchProfile } from "../src/lib/score";
import { companyQuality, signalsFromRows } from "../src/lib/companyQuality";
import type { Job } from "../src/lib/collector/types";
import { rampLimit, effectiveDailyLimit, bouncePaused, isBounceMessage, fromAddress, isDelayNotice, isAutoReply } from "../src/lib/outreach/limits";
import { formatInr, formatPay, formatUsdThreshold, convert } from "../src/lib/currency";
import { seniorityOf, matchesQuery, matchesLocation, postedWithin, countryOf, openToIndia, sourceLabel } from "../src/lib/role-filters";
import { parseLocations, searchCacheKey } from "../src/lib/contacts/apollo";
import { buildJobQuery, buildCompanyQuery, parseResults, cleanSnippet, parseAtsUrl, prettifySlug, JOB_HOSTS } from "../src/lib/websearch";
import { parseCompanyList, chunk } from "../src/lib/company-import";
import { buildQueue, todoCount } from "../src/lib/outreach/queue";
import { parseRemotive, parseArbeitnow, parseAdzuna } from "../src/lib/collectors/aggregators";
import { buildPipeline } from "../src/lib/pipeline";
import { roleFamily as ingestFamily } from "../src/lib/jobs/process";
import { newBoards, todaysQueries } from "../src/lib/jobs/discover";
import { isSafeHost, findBoardsInHtml, pickHomepage, careerPageCandidates } from "../src/lib/jobs/company-finder";
import { parseWorkdayUrl, splitWorkdaySlug, parsePostedOn, parseWorkdayList } from "../src/lib/collectors/workday-url";
import { fetchWorkday } from "../src/lib/collectors/workday";
import { boardName } from "../src/lib/websearch";
import { parseJSearch, listingsForCompany, listingToRaw } from "../src/lib/collectors/jsearch";
import { looksLikePosting } from "../src/lib/jobs/company-finder";
import { roleCounts, filterCompanies, filterCounts, needsAttention, type CompanyRow } from "../src/lib/company-list";
import { wordCount, subjectOptions, messageChecks, isAngle } from "../src/lib/outreach/message-checks";
import { buildBoard, stageOf, type BoardContact } from "../src/lib/board";
import { isWarmAuthorized } from "../src/lib/warm";
import { applyFeedback } from "../src/lib/feedback";
import { rateLimitShared } from "../src/lib/rate-limit";
import { fakeSupabase } from "./helpers/fake-supabase";
import { claimStep, markBounced, recentBounceStats, stopContact } from "../src/lib/outreach/engine";
import { encryptSecret, decryptSecret, isEncrypted } from "../src/lib/crypto";
import { failedSteps } from "../src/lib/ops";
import { unsupportedNumbers } from "../src/lib/apps/faithfulness";
import { pickProfileFields, pickPreferenceFields } from "../src/lib/profile-fields";
import { validateTemplate, renderTemplate, autoSendDecision, OPT_OUT, unknownFields } from "../src/lib/outreach/templates";
import { compareOffers, type OfferInput } from "../src/lib/offers";
import { isCronAuthorized } from "../src/lib/owner";
import { extractReplyText } from "../src/lib/outreach/gmail";
import { pickProvider, adaptGroqBody } from "../src/lib/ai";
import { cleanDomain, classifyTitle, parsePeople, buildSearchUrl, mergePeople, HIRING_TITLES, RECRUITER_TITLES } from "../src/lib/contacts/apollo";

test("sales role filter: keeps targets, drops noise", () => {
  assert.equal(roleFamily("Senior Sales Development Representative, EMEA"), "SDR/BDR");
  assert.equal(roleFamily("Founding BDR"), "SDR/BDR");
  assert.equal(roleFamily("GTM Engineer"), "GTM Engineer");
  assert.equal(roleFamily("Account Executive, Mid-Market"), "Account Executive");
  assert.equal(roleFamily("Manager, Sales Development"), "Sales leadership");
  for (const t of ["Sales Engineer", "Customer Success Engineer", "Technical Recruiter", "Senior Software Engineer", "Product Marketing Manager"]) assert.equal(roleFamily(t), null, t);
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

test("recipient timezone comes from email domain, market and location", () => {
  assert.equal(recipientTimezone({ email: "a@noon.ae" }), "Asia/Dubai");
  assert.equal(recipientTimezone({ email: "a@acme.co.uk" }), "Europe/London");
  assert.equal(recipientTimezone({ email: "a@acme.com", market: "UAE" }), "Asia/Dubai");
  assert.equal(recipientTimezone({ email: "a@acme.com", market: "Europe", location: "Berlin, Germany" }), "Europe/Berlin");
  assert.equal(recipientTimezone({ email: "a@acme.com", market: "US", location: "San Francisco, CA" }), "America/Los_Angeles");
  assert.equal(recipientTimezone({ email: "a@acme.com", market: "US" }), "America/New_York");
  assert.equal(recipientTimezone({ email: "a@acme.com" }), "Asia/Kolkata");   // unknown falls back to your own timezone
});

test("automatic sends wait for the recipient's morning on their working days", () => {
  assert.equal(inRecipientWindow("Asia/Dubai", new Date("2026-11-10T05:30:00Z")), true);   // Tue 09:30 Dubai
  assert.equal(inRecipientWindow("Asia/Dubai", new Date("2026-11-10T07:30:00Z")), false);  // Tue 11:30 Dubai, end is exclusive
  assert.equal(inRecipientWindow("Europe/London", new Date("2026-11-10T10:00:00Z")), true); // Tue 10:00 London
  assert.equal(inRecipientWindow("America/New_York", new Date("2026-11-10T15:00:00Z")), true); // Tue 10:00 New York
  assert.equal(inRecipientWindow("Asia/Kolkata", new Date("2026-11-10T01:45:00Z")), false);  // Tue 07:15 IST
  assert.equal(inRecipientWindow("Asia/Kolkata", new Date("2026-11-14T05:00:00Z")), false);  // Saturday
  assert.equal(inRecipientWindow("Asia/Riyadh", new Date("2026-11-13T07:00:00Z")), false);  // Friday in Saudi Arabia is weekend
  assert.equal(inRecipientWindow("Asia/Riyadh", new Date("2026-11-15T07:00:00Z")), true);   // Sunday 10:00 Riyadh is a working day
  assert.equal(inRecipientWindow("Asia/Dubai", new Date("2026-11-15T06:00:00Z")), false);   // Sunday in the UAE is weekend
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

test("people search: domains are cleaned and titles are classified", () => {
  assert.equal(cleanDomain("https://www.Acme.com/careers?x=1"), "acme.com");
  assert.equal(cleanDomain("apollo.io"), "apollo.io");
  for (const bad of ["", "localhost", "a b.com", "http://169.254.169.254:80/x y", "acme"]) assert.equal(cleanDomain(bad), null, bad);
  assert.equal(classifyTitle("Head of Sales, EMEA"), "hiring_manager");
  assert.equal(classifyTitle("Senior Technical Recruiter"), "recruiter");
  assert.equal(classifyTitle("Software Engineer"), "other");
  const url = buildSearchUrl("acme.com");
  assert.ok(url.startsWith("https://api.apollo.io/api/v1/mixed_people/api_search?"));
  assert.ok(url.includes("q_organization_domains_list%5B%5D=acme.com"));
});

test("people search: parses Apollo's response shape and ignores junk", () => {
  const json = { total_entries: 3, people: [
    { id: "p1", first_name: "Sam", last_name_obfuscated: "Pa***l", title: "Software Engineer", has_email: false, organization: { name: "Acme" } },
    { id: "p2", first_name: "Vik", last_name_obfuscated: "Va***z", title: "VP Sales", has_email: true, organization: { name: "Acme" } },
    { first_name: "NoId", title: "Recruiter" },
  ] };
  const people = parsePeople(json, "Fallback");
  assert.equal(people.length, 2);
  assert.equal(people[0].id, "p2");            // hiring-side people sort first
  assert.equal(people[0].role, "hiring_manager");
  assert.equal(people[0].hasEmail, true);
  assert.equal(people[0].lastHint, "Va***z");
  assert.deepEqual(parsePeople(null, "x"), []);
  assert.deepEqual(parsePeople({ people: "nope" }, "x"), []);
});

test("people search: sales leaders come first, recruiters fill the gap without duplicates", () => {
  const p = (id: string, role: "hiring_manager" | "recruiter") => ({ id, firstName: id, lastHint: "", title: "", company: "A", hasEmail: false, role });
  const merged = mergePeople([p("h1", "hiring_manager"), p("h2", "hiring_manager")], [p("r1", "recruiter"), p("h1", "hiring_manager")], 3);
  assert.deepEqual(merged.map((x) => x.id), ["h1", "h2", "r1"]);
  assert.equal(mergePeople(Array.from({ length: 20 }, (_, i) => p(`x${i}`, "recruiter")), []).length, 15);
  const hiringUrl = buildSearchUrl("acme.com", HIRING_TITLES);
  assert.ok(hiringUrl.includes("head+of+sales") && !hiringUrl.includes("recruiter"));
  assert.ok(buildSearchUrl("acme.com", RECRUITER_TITLES).includes("recruiter"));
});

test("sending ramp: 5, 10, 15, then 20 a day, never above the cap", () => {
  const start = "2026-11-01T00:00:00Z";
  const day = (n: number) => Date.parse(start) + n * 864e5 + 3600_000;
  assert.equal(rampLimit(null), 5);
  assert.deepEqual([0, 3, 4, 7, 8, 11, 12, 30].map((n) => rampLimit(start, day(n))), [5, 5, 10, 10, 15, 15, 20, 20]);
  assert.equal(effectiveDailyLimit(40, start, day(30)), 20);   // 20 a day ceiling
  assert.equal(effectiveDailyLimit(8, start, day(30)), 8);     // your own lower setting wins
  assert.equal(effectiveDailyLimit(20, start, day(1)), 5);     // still warming up
});

test("bounces: recognised from the sender or subject, and pause auto-send above 2%", () => {
  assert.equal(isBounceMessage("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Failure)"), true);
  assert.equal(isBounceMessage("postmaster@corp.example", "Undeliverable: Hello"), true);
  assert.equal(isBounceMessage("Priya <priya@acme.com>", "Re: Quick question"), false);
  assert.equal(bouncePaused(9, 9), false);    // too few sends to judge
  assert.equal(bouncePaused(100, 2), false);  // exactly 2% is fine
  assert.equal(bouncePaused(100, 3), true);
  assert.equal(bouncePaused(0, 0), false);
});

test("templates: only fixed merge fields, opt-out and signature always added", () => {
  assert.equal(validateTemplate("Hi {first_name}", "I saw {company} is hiring a {role_title}. {sender_name}"), null);
  assert.match(validateTemplate("Hi", "Your salary is {salary}") ?? "", /\{salary\}/);
  assert.ok(validateTemplate("", "x"));
  assert.ok(validateTemplate("s", "x".repeat(1501)));
  assert.deepEqual(unknownFields("{first_name} {x} {x} {y}"), ["x", "y"]);
  const out = renderTemplate({ subject: "About {role_title}", body: "Hi {first_name}, {company} looks great. {sender_name}" },
    { first_name: "Priya", company: "Acme", role_title: "SDR", sender_name: "Manzar" }, "Manzar, SDR");
  assert.equal(out.subject, "About SDR");
  assert.ok(out.body.startsWith("Hi Priya, Acme looks great. Manzar"));
  assert.ok(out.body.includes("Manzar, SDR") && out.body.endsWith(OPT_OUT));
});

test("auto-send: every safety condition must hold, otherwise it stays a draft", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  const ok = { enabled: true, templateApproved: true, fit: 82, minFit: 75, rampStart: "2026-11-01T00:00:00Z", recipientName: "Priya Rao", now };
  assert.deepEqual(autoSendDecision(ok), { auto: true, reason: "ok" });
  assert.equal(autoSendDecision({ ...ok, enabled: false }).auto, false);               // off by default
  assert.equal(autoSendDecision({ ...ok, templateApproved: false }).auto, false);      // template not approved
  assert.equal(autoSendDecision({ ...ok, fit: 74 }).auto, false);                      // below your minimum fit
  assert.equal(autoSendDecision({ ...ok, fit: null }).auto, false);                    // no job, no fit
  assert.equal(autoSendDecision({ ...ok, rampStart: null }).auto, false);              // never sent anything yet
  assert.equal(autoSendDecision({ ...ok, rampStart: "2026-11-15T00:00:00Z" }).auto, false); // first week: approve everything
  assert.equal(autoSendDecision({ ...ok, recipientName: "Max An***l" }).auto, false);  // partial name from search
  assert.equal(autoSendDecision({ ...ok, recipientName: "  " }).auto, false);
});

test("offers: yearly cash converts to USD and ranks open offers", () => {
  const base: OfferInput = { id: "", company: "", role_title: null, location: null, currency: "USD", base: null, variable: null, joining_bonus: null, equity_note: null, visa_note: null, notes: null, deadline: null, status: "considering" };
  const rows = compareOffers([
    { ...base, id: "a", company: "A", currency: "INR", base: 2_520_000, variable: 840_000 },       // 3.36M INR is about 40k USD
    { ...base, id: "b", company: "B", currency: "USD", base: 60_000, variable: 20_000, joining_bonus: 5_000 },
    { ...base, id: "c", company: "C", currency: "AED", base: 300_000, status: "declined" },         // declined offers are not ranked
    { ...base, id: "d", company: "D" },                                                             // no pay entered
  ]);
  const by = (id: string) => rows.find((r) => r.id === id)!;
  assert.equal(by("a").annualUsd, 40_000);
  assert.equal(by("b").annualUsd, 80_000);
  assert.equal(by("b").yearOneUsd, 85_000);
  assert.equal(by("b").rank, 1);
  assert.equal(by("b").isBest, true);
  assert.equal(by("a").rank, 2);
  assert.equal(by("c").rank, null);
  assert.equal(by("d").annualUsd, null);
  assert.equal(compareOffers([{ ...base, id: "x", base: 1000 }])[0].isBest, false); // a single offer is not "best"
});

test("AI provider: Groq, then Gemini, then OpenRouter, then Anthropic", () => {
  assert.equal(pickProvider({}).name, "none");
  assert.equal(pickProvider({ GROQ_API_KEY: "gsk_abcdefghijk", OPENROUTER_API_KEY: "sk-or-abcdefghij" }).name, "groq");
  assert.equal(pickProvider({ GEMINI_API_KEY: "AIza-abcdefghij", OPENROUTER_API_KEY: "sk-or-abcdefghij" }).name, "gemini");
  assert.equal(pickProvider({ GEMINI_API_KEY: "AIza-abcdefghij" }).baseURL, "https://generativelanguage.googleapis.com/v1beta/openai/");
  assert.equal(pickProvider({ OPENROUTER_API_KEY: "sk-or-abcdefghij", ANTHROPIC_API_KEY: "sk-ant-abcdefghij" }).name, "openrouter");
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: "sk-ant-abcdefghij" }).name, "anthropic");
  assert.equal(pickProvider({ GROQ_API_KEY: "short" }).name, "none");
  const g = pickProvider({ GROQ_API_KEY: "gsk_abcdefghijk" });
  assert.equal(g.baseURL, "https://api.groq.com/openai/v1");
  assert.equal(g.model, "openai/gpt-oss-120b");
  assert.equal(pickProvider({ GROQ_API_KEY: "gsk_abcdefghijk", GROQ_MODEL: "other/model" }).model, "other/model");
});

test("Groq requests: low reasoning and headroom so short answers are not cut off", () => {
  const out = adaptGroqBody({ model: "openai/gpt-oss-120b", max_tokens: 120, messages: [] });
  assert.equal(out.reasoning_effort, "low");
  assert.equal(out.max_completion_tokens, 920);
  assert.equal("max_tokens" in out, false);
  const other = adaptGroqBody({ model: "llama-3.3-70b-versatile", messages: [] });
  assert.equal("reasoning_effort" in other, false);
});

test("cron auth: needs the exact secret, tolerates stray whitespace, fails closed", () => {
  assert.equal(isCronAuthorized("Bearer abc123", "abc123"), true);
  assert.equal(isCronAuthorized("Bearer abc123", "abc123\n"), true);   // newline saved with the value
  assert.equal(isCronAuthorized("Bearer abc123 ", " abc123"), true);
  assert.equal(isCronAuthorized("Bearer wrong", "abc123"), false);
  assert.equal(isCronAuthorized("abc123", "abc123"), false);          // missing the Bearer prefix
  assert.equal(isCronAuthorized(null, "abc123"), false);
  assert.equal(isCronAuthorized("Bearer ", ""), false);                // no secret configured: always closed
  assert.equal(isCronAuthorized("Bearer undefined", undefined), false);
});

test("reply text: reads the plain part and drops the quoted original", () => {
  const body = "Thanks, happy to chat Tuesday.\n\nOn Mon, 9 Nov 2026 at 21:40, Manzar <me@gmail.com> wrote:\n> Hi Priya,\n> I saw Acme is hiring.";
  const payload = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: Buffer.from("<p>x</p>").toString("base64url") } }, { mimeType: "text/plain", body: { data: Buffer.from(body).toString("base64url") } }] };
  assert.equal(extractReplyText(payload, "snippet"), "Thanks, happy to chat Tuesday.");
  assert.equal(extractReplyText({ mimeType: "text/html" }, "Just the snippet"), "Just the snippet");
  assert.equal(extractReplyText(undefined, ""), "");
});

test("reply detection compares exact addresses, not substrings", () => {
  assert.equal(fromAddress("Jo Ann <JoAnn@X.com>"), "joann@x.com");
  assert.equal(fromAddress("ann@x.com"), "ann@x.com");
  assert.notEqual(fromAddress("Jo Ann <joann@x.com>"), "ann@x.com");   // contains, but is not, your address
  assert.notEqual(fromAddress("Bob <bob@acme.com>"), "b@acme.com");
});

test("delay notices and out-of-office replies are neither bounces nor replies", () => {
  assert.equal(isBounceMessage("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Delay)"), false);
  assert.equal(isDelayNotice("Delivery Status Notification (Delay)"), true);
  assert.equal(isBounceMessage("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Failure)"), true);
  for (const s of ["Automatic reply: Quick question", "Out of office: back Monday", "Autoreply: hello"]) assert.equal(isAutoReply(s), true, s);
  assert.equal(isAutoReply("Re: Quick question"), false);
});

test("profile writes keep only allowed fields, never send-safety settings", () => {
  const out = pickProfileFields({ name: "A", tools: ["x"], autosend_enabled: true, email_ramp_start: "2020-01-01", user_id: "other", profile_embedding: [1] });
  assert.deepEqual(out, { name: "A", tools: ["x"] });
  assert.deepEqual(pickPreferenceFields({ countries: ["India"], autosend_enabled: true, email_daily_limit: 500, autopilot_mode: "auto" }), { countries: ["India"] });
});

const asClient = (f: ReturnType<typeof fakeSupabase>) => f as never;

test("an email can be claimed for sending by exactly one caller", async () => {
  const db = fakeSupabase({ outreach: [{ id: "o1", status: "scheduled", sent_at: null }] });
  assert.equal(await claimStep(asClient(db), "o1"), true);
  assert.equal(await claimStep(asClient(db), "o1"), false);               // a second run, tick or click gets nothing
  const [a, b] = await Promise.all([claimStep(asClient(fakeSupabase({ outreach: [{ id: "o2", status: "draft", sent_at: null }] })), "o2"), Promise.resolve(false)]);
  assert.equal(a, true); assert.equal(b, false);
  const sent = fakeSupabase({ outreach: [{ id: "o3", status: "sent", sent_at: "2026-11-09T10:00:00Z" }] });
  assert.equal(await claimStep(asClient(sent), "o3"), false);             // already sent is never claimable
});

test("a bounce is counted even after the sequence is stopped", async () => {
  const now = new Date().toISOString();
  const db = fakeSupabase({ outreach: [
    { id: "a", user_id: "u", contact_id: "c1", channel: "email", status: "sent", sent_at: now, error: null },
    { id: "b", user_id: "u", contact_id: "c2", channel: "email", status: "sent", sent_at: now, error: null },
    { id: "c", user_id: "u", contact_id: "c2", channel: "email", status: "draft", sent_at: null, error: null },
  ] });
  await markBounced(asClient(db), "c2");
  assert.deepEqual(await recentBounceStats(asClient(db), "u"), { sent: 2, bounced: 1 });
  assert.equal(db.tables.outreach.find((r) => r.id === "c")?.status, "stopped");   // unsent follow-up stopped
  assert.equal(db.tables.outreach.find((r) => r.id === "b")?.error, "Bounced");    // marker kept
});

test("a reply is counted once, however many times it is detected", async () => {
  const db = fakeSupabase({ outreach: [
    { id: "s1", user_id: "u", contact_id: "c", status: "sent", sent_at: "2026-11-09T05:00:00Z" },
    { id: "s2", user_id: "u", contact_id: "c", status: "sent", sent_at: "2026-11-11T05:00:00Z" },
    { id: "d3", user_id: "u", contact_id: "c", status: "draft", sent_at: null },
  ], funnel_events: [] });
  await stopContact(asClient(db), "c", "replied");
  await stopContact(asClient(db), "c", "replied");
  assert.equal(db.tables.funnel_events.length, 1);
  assert.deepEqual(db.tables.outreach.map((r) => r.status), ["replied", "replied", "stopped"]);
});

test("sensitive form questions are recognised in many wordings", () => {
  const cases: [string, string | null][] = [
    ["Will you now or in the future require visa sponsorship?", "visa_sponsorship"],
    ["Are you legally able to work in the UK?", "work_authorisation"],
    ["What are your pay requirements?", "salary_expectation"],
    ["What is your expected CTC?", "salary_expectation"],
    ["Describe your ideal remuneration package", "salary_expectation"],
    ["How soon can you join?", "notice_period"],
    ["What is your notice period?", "notice_period"],
    ["How do you identify in terms of gender?", "diversity"],
    ["Are you a protected veteran?", "diversity"],
    ["Why do you want to join Acme?", null],
    ["How do you manage embracing change and disabling bad habits?", null],   // "disab", "race" inside other words
    ["Describe your outbound process", null],
  ];
  for (const [q, key] of cases) assert.equal(matchSensitive(q), key, q);
});

test("generated text is flagged when it uses numbers the CV does not have", () => {
  const cv = "Senior SDR at Acme. Hit 112% of quota. Booked 25 meetings per month. Closed $1.2M pipeline in 2024.";
  assert.deepEqual(unsupportedNumbers("Hit 112% of quota and booked 25 meetings a month.", [cv]), []);
  assert.deepEqual(unsupportedNumbers("Built $1,200,000 pipeline", [cv]).length, 1);          // different figure
  assert.deepEqual(unsupportedNumbers("Exceeded quota by 140% and booked 40 meetings", [cv]).sort(), ["140%", "40"].sort());
  assert.deepEqual(unsupportedNumbers("I have 3 years and 2 emails", [cv]), []);             // single digits are ignored
});

test("target role types come from the profile, and default to all three", () => {
  assert.deepEqual(familiesFromTitles(["Senior SDR", "BDR"]), ["SDR/BDR"]);
  assert.deepEqual(familiesFromTitles(["Account Executive (SMB)", "GTM Engineer"]).sort(), ["Account Executive", "GTM Engineer"]);
  assert.deepEqual(familiesFromTitles([]).sort(), ["Account Executive", "GTM Engineer", "SDR/BDR"]);
  const profile = buildSearchProfile({ name: "A", target_titles: ["SDR"], markets: ["India", "UK"], tools: ["Clay"], min_ote_usd: 50000 });
  assert.deepEqual(profile.targetFamilies, ["SDR/BDR"]);
  assert.deepEqual([...profile.markets].sort(), ["emea", "india", "remote-in"]);
  const aeJob = { ...baseJob, roleFamily: "Account Executive" as const };
  assert.ok(scoreJob(aeJob, profile).score < scoreJob(baseJob, profile).score);   // an AE role scores below an SDR role for an SDR
});

test("tool names match whole words only", () => {
  assert.equal(mentions("We use Clay and HubSpot daily", "Clay"), true);
  assert.equal(mentions("Clayton office, Clayton team", "Clay"), false);
  assert.equal(mentions("experience with Sales Navigator (LinkedIn)", "LinkedIn Sales Navigator"), false);
  assert.equal(mentions("Salesforce.com required", "Salesforce"), true);
  assert.equal(mentions("anything", ""), false);
  assert.equal(mentions("C++ and node.js", "node.js"), true);               // regex characters in a tool name are safe
});

test("base-only pay is not compared with an OTE minimum; Singapore dollars convert", () => {
  const p = { ...baseProfile, minOteUsd: 90000 };
  const base = scoreJob({ ...baseJob, payKind: "base", payMax: 60000 }, p).parts.find((x) => x.label === "Pay")?.value;
  const ote = scoreJob({ ...baseJob, payKind: "ote", payMax: 60000 }, p).parts.find((x) => x.label === "Pay")?.value;
  assert.equal(base, 50);    // unknown, not "below minimum"
  assert.equal(ote, 10);     // OTE below the minimum is a real miss
  assert.equal(toUsd(100000, "SGD"), 74000);
});

test("stored secrets: encrypted when a key is set, readable back, and tamper-proof", () => {
  const env = { TOKEN_ENC_KEY: "a".repeat(64) };
  const stored = encryptSecret("1//refresh-token-value", env);
  assert.ok(isEncrypted(stored));
  assert.ok(!stored.includes("refresh-token-value"));
  assert.equal(decryptSecret(stored, env), "1//refresh-token-value");
  assert.notEqual(encryptSecret("same", env), encryptSecret("same", env));         // fresh random value each time
  assert.equal(encryptSecret("plain", {}), "plain");                                // no key: unchanged
  assert.equal(decryptSecret("legacy-plaintext", env), "legacy-plaintext");         // stored before encryption was on
  assert.throws(() => decryptSecret(stored, {}), /TOKEN_ENC_KEY/);
  assert.throws(() => decryptSecret(stored.slice(0, -4) + "AAAA", env));            // altered data is refused
  assert.equal(encryptSecret("x", { TOKEN_ENC_KEY: "short" }), "x");                // invalid key is ignored
});

test("failed steps are picked out of a job result", () => {
  assert.deepEqual(failedSteps({ user: "u", scoring: { scored: 5 }, outreach: { error: "boom" }, telegram: { error: "x" } }).sort(), ["outreach", "telegram"]);
  assert.deepEqual(failedSteps({ user: "u", scoring: { scored: 5 } }), []);
});

test("automatic sending only trusts a timezone it can actually tell", () => {
  assert.equal(knownRecipientTimezone({ email: "a@acme.com", market: "US" }), null);                         // US with no city: a guess
  assert.equal(knownRecipientTimezone({ email: "a@acme.com", market: "US", location: "Austin, TX" }), "America/Chicago");
  assert.equal(knownRecipientTimezone({ email: "a@acme.com" }), null);                                       // nothing to go on
  assert.equal(knownRecipientTimezone({ email: "a@acme.ae" }), "Asia/Dubai");
  assert.equal(knownRecipientTimezone({ email: "a@acme.com", market: "Europe" }), "Europe/Berlin");
  assert.equal(knownRecipientTimezone({ email: "a@acme.com", market: "India" }), "Asia/Kolkata");
  assert.equal(recipientTimezone({ email: "a@acme.com" }), "Asia/Kolkata");                                  // display still falls back
});

test("the shared rate limit counts per window and falls back when the database counter is missing", async () => {
  let n = 0;
  const bump = async () => ++n;
  assert.equal(await rateLimitShared("k1", 2, 60_000, bump), true);
  assert.equal(await rateLimitShared("k1", 2, 60_000, bump), true);
  assert.equal(await rateLimitShared("k1", 2, 60_000, bump), false);              // third call in the window is refused
  const missing = async () => null;                                                // table or function not created yet
  assert.equal(await rateLimitShared("k2", 1, 60_000, missing), true);
  assert.equal(await rateLimitShared("k2", 1, 60_000, missing), false);          // the per-instance fallback still limits
});

test("skipping and saving at a company nudges its other roles, with a reason", () => {
  const job = (id: string, company: string, score = 70) => ({ id, company, score, explanation: "Base." });
  const jobs = [job("a", "Acme"), job("b", "Acme"), job("c", "Acme"), job("d", "Acme"), job("e", "Beta"), job("f", "Beta"), job("g", "Beta")];
  const out = applyFeedback(jobs, { a: { reaction: "skipped" }, b: { reaction: "skipped" }, e: { reaction: "bookmarked" } });
  const by = (id: string) => out.find((j) => j.id === id)!;
  assert.equal(by("c").score, 60);                                   // two skips at Acme, no saves: -10
  assert.match(by("c").explanation, /Lowered by 10 because you skipped 2 other roles at Acme/);
  assert.equal(by("f").score, 75);                                   // one save at Beta: +5
  assert.match(by("f").explanation, /Raised by 5/);
  assert.equal(by("a").score, 70);                                   // roles you reacted to are untouched
  assert.equal(applyFeedback([job("x", "Solo")], {})[0].score, 70);  // no history, no change
  const many = Array.from({ length: 8 }, (_, i) => job(`s${i}`, "Gamma", 12));
  const skipped = Object.fromEntries(many.slice(0, 6).map((j) => [j.id, { reaction: "skipped" }]));
  assert.equal(applyFeedback(many, skipped).find((j) => j.id === "s7")!.score, 0);   // never below 0, and the drop is capped at 15
});

test("warm-up key: exact match only, and closed when no key is set", () => {
  const key = "k".repeat(24);
  assert.equal(isWarmAuthorized(key, key), true);
  assert.equal(isWarmAuthorized(` ${key}\n`, `${key} `), true);       // stray whitespace tolerated
  assert.equal(isWarmAuthorized("wrong".repeat(6), key), false);
  assert.equal(isWarmAuthorized(null, key), false);
  assert.equal(isWarmAuthorized(key, undefined), false);                // no key configured
  assert.equal(isWarmAuthorized("short", "short"), false);              // keys under 16 characters are refused
});

test("pay shows in rupees the Indian way, from any currency", () => {
  assert.equal(formatInr(85000), "₹85,000");
  assert.equal(formatInr(4500000), "₹45 L");
  assert.equal(formatInr(12500000), "₹1.3 Cr");
  assert.equal(formatInr(1200000), "₹12 L");
  assert.equal(convert(84, "USD", "INR"), 7056);
  assert.equal(formatPay(60000, 80000, "USD", "INR"), "₹50.4 L – ₹67.2 L");     // 60k and 80k dollars at 84 rupees
  assert.equal(formatPay(60000, 80000, "USD", "USD"), "$60k – $80k");
  assert.equal(formatPay(3000000, 4500000, "INR", "INR"), "₹30 L – ₹45 L");
  assert.equal(formatPay(undefined, 100000, "EUR", "USD"), "$108k");
  assert.equal(formatPay(10, 20, "XYZ", "INR"), "XYZ 0k");                      // unknown currency falls back to as-posted
  assert.equal(formatUsdThreshold(0, "INR"), "any");
  assert.equal(formatUsdThreshold(50000, "INR"), "₹42 L+");
});

test("role search: words in any order, level, location and posting date", () => {
  const job = { title: "Senior SDR", company: "Acme", location: "Bengaluru, India (Hybrid)", description: "Outbound with Salesforce and Outreach" };
  assert.equal(matchesQuery(job, "acme sdr"), true);
  assert.equal(matchesQuery(job, "salesforce outbound"), true);
  assert.equal(matchesQuery(job, "acme account executive"), false);
  assert.equal(matchesQuery(job, "  "), true);
  assert.equal(matchesLocation(job, "bengaluru"), true);
  assert.equal(matchesLocation(job, "dubai, india"), true);          // comma means "or"
  assert.equal(matchesLocation(job, "dubai"), false);
  assert.equal(seniorityOf("Senior SDR"), "senior");
  assert.equal(seniorityOf("Head of Sales"), "lead");
  assert.equal(seniorityOf("Associate BDR"), "entry");
  assert.equal(seniorityOf("Account Executive"), "mid");
  const now = Date.parse("2026-11-10T00:00:00Z");
  assert.equal(postedWithin("2026-11-05T00:00:00Z", 7, now), true);
  assert.equal(postedWithin("2026-10-01T00:00:00Z", 7, now), false);
  assert.equal(postedWithin(undefined, 7, now), true);                // unknown date is kept
  assert.equal(postedWithin("not a date", 7, now), true);
});

test("people search can be limited to places, and each filter set is saved separately", () => {
  assert.deepEqual(parseLocations(" Dubai, Bengaluru ;; "), ["Dubai", "Bengaluru"]);
  assert.equal(parseLocations("a,b,c,d,e,f,g").length, 5);
  const url = decodeURIComponent(buildSearchUrl("acme.com", ["recruiter"], ["Dubai"]));
  assert.match(url, /person_locations\[\]=Dubai/);
  assert.doesNotMatch(decodeURIComponent(buildSearchUrl("acme.com")), /person_locations/);
  assert.notEqual(searchCacheKey("acme.com", ["Dubai"], "both"), searchCacheKey("acme.com", [], "both"));
  assert.equal(searchCacheKey("acme.com", ["Dubai", "Pune"], "hiring"), searchCacheKey("acme.com", ["pune", "dubai"], "hiring"));
});

test("open-web search builds clean queries and drops LinkedIn and unsafe links", () => {
  const q = buildJobQuery({ role: "SDR", company: "Acme", location: "Dubai", workType: "remote", visa: true });
  assert.match(q, /SDR/); assert.match(q, /at Acme/); assert.match(q, /in Dubai/); assert.match(q, /visa sponsorship/);
  assert.doesNotMatch(buildJobQuery({ workType: "any" }), /\bany\b/);
  assert.doesNotMatch(buildJobQuery({ role: "SDR; DROP TABLE" }), /;/);
  assert.match(buildCompanyQuery({ industry: "fintech", location: "UAE", hiring: true }), /fintech companies in UAE hiring sales/);
  const out = parseResults({ results: [
    { title: "SDR at Acme", url: "https://jobs.acme.com/1", content: "Outbound role" },
    { title: "dup", url: "https://jobs.acme.com/1", content: "" },
    { title: "li", url: "https://www.linkedin.com/jobs/view/1", content: "x" },
    { title: "li2", url: "https://in.linkedin.com/jobs/2", content: "x" },
    { title: "plain http", url: "http://example.com/a", content: "x" },
    { title: "js", url: "javascript:alert(1)", content: "x" },
  ] });
  assert.deepEqual(out.map((r) => r.host), ["jobs.acme.com"]);
  assert.deepEqual(parseResults(null), []);
});

test("job results drop noise, read as plain text, and put real job pages first", () => {
  const out = parseResults({ results: [
    { title: "Careers", url: "https://www.accenture.com/us-en/careers", content: "x" },
    { title: "SDR", url: "https://tavily.com/knowledge/company/abc", content: "x" },
    { title: "post", url: "https://www.facebook.com/odoo/posts/1", content: "x" },
    { title: "Sales Development Representative", url: "https://jobs.acme.com/sdr-1", content: "[Apply](https://x.com) ## Role *Outbound*" },
  ] }, "jobs");
  assert.deepEqual(out.map((r) => r.host), ["jobs.acme.com", "accenture.com"]);
  assert.equal(out[0].snippet, "Apply Role Outbound");
  assert.equal(cleanSnippet("# Title | [a](http://b)"), "Title a");
});

test("company list import handles pasted lines, CSV, duplicates and spreadsheet formulas", () => {
  const { rows, skipped } = parseCompanyList("Company,Website\nAcme, https://www.acme.com/careers\n\"Globex, Inc\"\tglobex.io\nacme.com\nInitech\n=HYPERLINK(\"x\"),evil.com\nAcme, other.com");
  assert.deepEqual(rows.map((r) => r.name), ["Acme", "Globex, Inc", "Initech", "HYPERLINK(x)"]);
  assert.equal(rows[0].domain, "acme.com");
  assert.equal(rows[1].domain, "globex.io");
  assert.equal(rows[2].domain, null);
  assert.ok(!rows.some((r) => /^[=+\-@]/.test(r.name)));
  assert.equal(skipped, 2);                                    // the bare acme.com line and the second Acme
  assert.equal(parseCompanyList("  \n ").rows.length, 0);
  assert.equal(parseCompanyList(Array.from({ length: 500 }, (_, i) => `Co${i}, co${i}.com`).join("\n")).rows.length, 300);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("the daily outreach queue sorts people into what to do now", () => {
  const past = new Date(Date.now() - 864e5).toISOString(), future = new Date(Date.now() + 864e5).toISOString();
  const st = (id: string, i: number, channel: "email" | "linkedin_task", status: string, when: string | null) => ({ id, step_index: i, channel, status, scheduled_for: when });
  const fresh = { id: "a", name: "Fresh", steps: [st("a0", 0, "email", "draft", past), st("a1", 1, "linkedin_task", "task_open", future)] };
  const chasing = { id: "b", name: "Chasing", steps: [st("b0", 0, "email", "sent", past), st("b1", 1, "linkedin_task", "task_open", past), st("b2", 2, "email", "draft", past), st("b3", 4, "email", "draft", future)] };
  const early = { id: "c", name: "Early", steps: [st("c0", 0, "email", "draft", past), st("c2", 2, "email", "draft", past)] };
  const waiting = { id: "d", name: "Waiting", steps: [st("d0", 0, "email", "sent", past), st("d2", 2, "email", "draft", future)] };
  const replied = { id: "e", name: "Replied", steps: [st("e0", 0, "email", "replied", past), st("e2", 2, "email", "draft", past)] };
  const finished = { id: "f", name: "Done", steps: [st("f0", 0, "email", "stopped", past)] };
  const q = buildQueue([fresh, chasing, early, waiting, replied, finished]);
  assert.deepEqual(q.needsOk.map((i) => i.step.id), ["a0", "c0"]);
  assert.deepEqual(q.followUps.map((i) => i.step.id), ["b2"]);          // only after the first email went out, and only when due
  assert.deepEqual(q.linkedin.map((i) => i.step.id), ["b1"]);
  assert.deepEqual(q.replied.map((c) => c.id), ["e"]);
  assert.deepEqual(q.waiting.map((c) => c.id), ["d"]);
  assert.equal(todoCount(q), 4);
});

test("free job feeds are read into one shape and bad rows are dropped", () => {
  const r = parseRemotive({ jobs: [
    { id: 1, url: "https://remotive.com/j/1", title: "SDR", company_name: "Acme", candidate_required_location: "Worldwide", publication_date: "2026-11-01T00:00:00", description: "<p>Outbound</p>" },
    { id: 2, title: "No link" },
  ] });
  assert.equal(r.length, 1);
  assert.equal(r[0].raw.location, "Remote · Worldwide");
  assert.equal(r[0].raw.remote, true);
  const a = parseArbeitnow({ data: [{ slug: "s1", url: "https://www.arbeitnow.com/jobs/s1", title: "BDR", company_name: "Beta", location: "Berlin", remote: false, created_at: 1762732800 }] });
  assert.equal(a[0].raw.posted_at, "2025-11-10T00:00:00.000Z");
  const z = parseAdzuna({ results: [
    { id: "9", title: "<b>SDR</b>", redirect_url: "https://adzuna.in/x", company: { display_name: "Gamma" }, location: { display_name: "Pune, India" }, salary_min: 600000, salary_max: 900000, salary_is_predicted: "0", created: "2026-11-09T00:00:00Z" },
    { id: "10", title: "AE", redirect_url: "https://adzuna.in/y", salary_min: 1, salary_max: 2, salary_is_predicted: "1" },
  ] });
  assert.equal(z[0].raw.title, "SDR");
  assert.equal(z[0].raw.pay_verified, true);              // a real published range
  assert.equal(z[1].raw.pay_verified, undefined);         // a predicted range is never shown as published pay
  assert.deepEqual(parseRemotive(null), []);
  assert.deepEqual(parseAdzuna({}), []);
});

test("country filter, open-to-India check and plain source labels", () => {
  assert.equal(countryOf("Bengaluru, Karnataka"), "India");
  assert.equal(countryOf("Dubai, UAE"), "UAE");
  assert.equal(countryOf("Remote · Worldwide"), "Remote");
  assert.equal(countryOf("Berlin, Germany"), "Germany");
  assert.equal(countryOf("Springfield"), "Other");
  assert.equal(openToIndia("Pune, India", "onsite"), true);
  assert.equal(openToIndia("Remote · Worldwide", "remote"), true);
  assert.equal(openToIndia("Remote · APAC", "remote"), true);
  assert.equal(openToIndia("Remote, USA", "remote"), false);          // remote but tied to another country
  assert.equal(openToIndia("London, UK", "onsite"), false);
  assert.equal(openToIndia("Remote", "remote"), true);
  assert.equal(sourceLabel("greenhouse"), "Company careers page");
  assert.equal(sourceLabel("adzuna"), "Job feed · Adzuna");
  assert.equal(sourceLabel("mystery"), "Source · mystery");
});

test("pipeline counts people once, ignores skipped applications and flags leaks", () => {
  const steps = [
    ...Array.from({ length: 22 }, (_, i) => ({ contact_id: `c${i}`, channel: "email", status: "sent" })),
    { contact_id: "c0", channel: "email", status: "sent" },          // a second email to the same person
    { contact_id: "c0", channel: "linkedin_task", status: "task_done" },
    { contact_id: "c99", channel: "linkedin_task", status: "task_done" },
    { contact_id: "c1", channel: "email", status: "replied" },
  ];
  const p = buildPipeline({
    saved: 12,
    apps: [{ stage: "applied", status: "submitted", board: "greenhouse" }, { stage: "interview", status: "submitted", board: "greenhouse" }, { stage: "applied", status: "skipped", board: "adzuna" }, { stage: "offer", status: "submitted", board: null }],
    steps, referralInterviews: 1,
  });
  const n = (k: string) => p.stages.find((s) => s.key === k)?.count;
  assert.equal(n("applied"), 3);                                      // the skipped one does not count
  assert.equal(n("contacted"), 23);                                   // 22 emailed + one LinkedIn-only person, each once
  assert.equal(n("replied"), 1);
  assert.equal(n("interviews"), 3);                                   // interview + offer applications + one referral interview
  assert.equal(n("offers"), 1);
  assert.equal(p.replyRate, 4.5);                                     // 1 reply out of 22 people emailed
  assert.ok(p.hints.some((h) => /Under 3%/.test(h)) === false);
  assert.equal(p.bySource.find((s) => s.source === "Company careers page")?.interviews, 1);
  const empty = buildPipeline({ saved: 0, apps: [], steps: [], referralInterviews: 0 });
  assert.equal(empty.replyRate, null);
  assert.match(empty.hints[0], /Nothing tracked yet/);
  const leak = buildPipeline({ saved: 0, apps: [], steps: Array.from({ length: 25 }, (_, i) => ({ contact_id: `x${i}`, channel: "email", status: "sent" })), referralInterviews: 0 });
  assert.ok(leak.hints.some((h) => /Under 3%/.test(h)));
});

test("the wider role list keeps adjacent sales roles and still drops engineering and support", () => {
  assert.equal(ingestFamily("Senior SDR"), "SDR/BDR");
  assert.equal(ingestFamily("Inside Sales Representative"), "SDR/BDR");
  assert.equal(ingestFamily("Sales Manager, EMEA"), "Sales leadership");
  assert.equal(ingestFamily("Key Account Manager"), "Account management");
  assert.equal(ingestFamily("Partnerships Manager"), "Partnerships");
  assert.equal(ingestFamily("Channel Sales Manager"), "Partnerships");
  assert.equal(ingestFamily("Revenue Operations Analyst"), "Sales ops & CS");
  assert.equal(ingestFamily("Customer Success Manager"), "Sales ops & CS");
  assert.equal(ingestFamily("Technical Account Manager"), null);
  assert.equal(ingestFamily("Customer Success Engineer"), null);
  assert.equal(ingestFamily("Sales Engineer"), null);
  assert.equal(ingestFamily("Software Engineer"), null);
  assert.equal(ingestFamily("Sales Intern"), null);
});

test("job-page links reveal company boards, and discovery adds only new ones", () => {
  assert.deepEqual(parseAtsUrl("https://boards.greenhouse.io/acme/jobs/123"), { ats: "greenhouse", slug: "acme" });
  assert.deepEqual(parseAtsUrl("https://job-boards.greenhouse.io/globex-inc/jobs/9"), { ats: "greenhouse", slug: "globex-inc" });
  assert.deepEqual(parseAtsUrl("https://jobs.lever.co/initech/abc-123"), { ats: "lever", slug: "initech" });
  assert.deepEqual(parseAtsUrl("https://jobs.ashbyhq.com/umbrella/uuid"), { ats: "ashby", slug: "umbrella" });
  assert.deepEqual(parseAtsUrl("https://jobs.smartrecruiters.com/Hooli/743-sdr"), { ats: "smartrecruiters", slug: "Hooli" });
  assert.equal(parseAtsUrl("https://medium.com/some-blog-post"), null);
  assert.equal(parseAtsUrl("http://boards.greenhouse.io/acme/jobs/1"), null);        // https only
  assert.equal(prettifySlug("acme-corp_labs"), "Acme Corp Labs");
  const found = newBoards([
    "https://boards.greenhouse.io/acme/jobs/1", "https://boards.greenhouse.io/acme/jobs/2", "https://jobs.lever.co/new-co/x", "https://example.com/x",
  ], new Set(["greenhouse/acme"]));
  assert.deepEqual(found, [{ ats: "lever", slug: "new-co" }]);
  assert.ok(JOB_HOSTS.includes("jobs.lever.co") && !JOB_HOSTS.includes("medium.com"));
  assert.ok(!/\bapply\b|opening/.test(buildJobQuery({ role: "SDR", location: "Dubai" })));
  const q1 = todaysQueries(25, 0), q2 = todaysQueries(25, 864e5);
  assert.equal(q1.length, 25);
  assert.notDeepEqual(q1, q2);                                                       // the slice moves each day
});

test("the company finder only fetches public websites and reads job systems out of careers pages", () => {
  assert.equal(isSafeHost("freshworks.com"), true);
  for (const bad of ["127.0.0.1", "10.0.0.5", "localhost", "intranet.corp", "a.internal", "169.254.169.254", "foo", "x.local", "evil.test"]) assert.equal(isSafeHost(bad), false, bad);
  assert.ok(careerPageCandidates("acme.com").every((u) => u.startsWith("https://")));
  const html = `<a href="https://boards.greenhouse.io/acme/jobs/1">x</a><iframe src="https://jobs.lever.co/acme-labs/?a=1&amp;b=2"></iframe>
    <a href="https://acme.wd5.myworkdayjobs.com/en-US/External?q=1">w</a><a href="https://example.com/blog">b</a><a href="https://boards.greenhouse.io/acme/jobs/2">dup</a>`;
  const f = findBoardsInHtml(html);
  assert.deepEqual(f.boards, [{ ats: "greenhouse", slug: "acme" }, { ats: "lever", slug: "acme-labs" }, { ats: "workday", slug: "acme.wd5.myworkdayjobs.com|External" }]);
  assert.equal(f.workday, "https://acme.wd5.myworkdayjobs.com/en-US/External");
  assert.deepEqual(findBoardsInHtml("<p>nothing</p>"), { boards: [], workday: null });
  const r = (host: string) => ({ title: host, url: `https://${host}/`, host, snippet: "" });
  assert.equal(pickHomepage("Freshworks", [r("linkedin.com"), r("en.wikipedia.org"), r("freshworks.com")]), "freshworks.com");
  assert.equal(pickHomepage("Freshworks", [r("glassdoor.com"), r("randomblog.io")]), null);
  assert.equal(pickHomepage("AB", [r("ab.com")]), null);                       // too short to match safely
});

test("Workday boards are recognised from links, read safely, and only sales roles are kept", async () => {
  assert.deepEqual(parseWorkdayUrl("https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dubai/SDR_R1"), { host: "acme.wd5.myworkdayjobs.com", site: "External" });
  assert.deepEqual(parseWorkdayUrl("https://acme.wd1.myworkdayjobs.com/Careers"), { host: "acme.wd1.myworkdayjobs.com", site: "Careers" });
  assert.equal(parseWorkdayUrl("https://evil.com/acme.wd5.myworkdayjobs.com/External"), null);
  assert.equal(parseWorkdayUrl("http://acme.wd5.myworkdayjobs.com/External"), null);
  assert.deepEqual(splitWorkdaySlug("acme.wd5.myworkdayjobs.com|External"), { host: "acme.wd5.myworkdayjobs.com", tenant: "acme", site: "External" });
  assert.equal(splitWorkdaySlug("127.0.0.1|External"), null);                       // only real Workday hosts are ever called
  assert.equal(splitWorkdaySlug("acme.wd5.myworkdayjobs.com.evil.com|External"), null);
  assert.equal(boardName({ ats: "workday", slug: "acme-corp.wd5.myworkdayjobs.com|External" }), "Acme Corp");
  const now = Date.parse("2026-11-10T00:00:00Z");
  assert.equal(parsePostedOn("Posted Today", now), "2026-11-10T00:00:00.000Z");
  assert.equal(parsePostedOn("Posted 3 Days Ago", now), "2026-11-07T00:00:00.000Z");
  assert.equal(parsePostedOn("Posted 30+ Days Ago", now), "2026-10-11T00:00:00.000Z");
  assert.equal(parsePostedOn("", now), null);
  assert.equal(parseWorkdayList({ jobPostings: [{ title: "SDR", externalPath: "/job/x", locationsText: "Dubai" }, { title: "bad" }, { externalPath: "/job/y" }] }, now).length, 1);

  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url); calls.push(u);
    if (u.endsWith("/jobs")) {
      const term = JSON.parse(String(init?.body)).searchText;
      const postings = term === "sales" ? [
        { title: "Sales Development Representative", externalPath: "/job/Dubai/SDR_R1", locationsText: "Dubai", postedOn: "Posted 2 Days Ago" },
        { title: "Software Engineer", externalPath: "/job/Pune/SWE_R2", locationsText: "Pune", postedOn: "Posted Today" },
      ] : [];
      return new Response(JSON.stringify({ total: postings.length, jobPostings: postings }), { status: 200 });
    }
    return new Response(JSON.stringify({ jobPostingInfo: { jobDescription: "<p>Outbound role</p>", startDate: "2026-11-08", remoteType: "Remote" } }), { status: 200 });
  }) as typeof fetch;
  try {
    const jobs = await fetchWorkday("acme.wd5.myworkdayjobs.com|External");
    assert.equal(jobs.length, 1);                                                    // the engineer is never kept or fetched
    assert.equal(jobs[0].title, "Sales Development Representative");
    assert.equal(jobs[0].url, "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dubai/SDR_R1");
    assert.equal(jobs[0].remote, true);
    assert.equal(jobs[0].posted_at, "2026-11-08T00:00:00.000Z");
    assert.ok(!calls.some((c) => c.includes("SWE_R2")));
    assert.ok(calls.every((c) => c.startsWith("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External")));
    await assert.rejects(() => fetchWorkday("evil.com|External"), /not a valid Workday board/);
  } finally { globalThis.fetch = realFetch; }
});

test("company results keep real postings, drop category pages, and read licensed Google-Jobs-style listings", () => {
  assert.equal(looksLikePosting("https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Rome/Enterprise-Sales-Account-Manager_R167568"), true);
  assert.equal(looksLikePosting("https://boards.greenhouse.io/acme/jobs/12345"), true);
  assert.equal(looksLikePosting("https://jobs.lever.co/acme/3f2a8c1e-aaaa-bbbb-cccc-1234567890ab"), true);
  assert.equal(looksLikePosting("https://careers.acme.com/us/en/job/12345/Sales-Rep"), true);
  assert.equal(looksLikePosting("https://careers.adobe.com/us/en/sales-jobs"), false);
  assert.equal(looksLikePosting("https://careers.adobe.com/us/en/search-results"), false);
  assert.equal(looksLikePosting("https://careers.adobe.com/"), false);
  assert.equal(looksLikePosting("not a url"), false);
  const cards = parseJSearch({ data: [
    { job_id: "1", job_title: "Account Executive", employer_name: "Adobe", job_city: "Bengaluru", job_state: "Karnataka", job_country: "IN", job_apply_link: "https://careers.adobe.com/j/1", job_publisher: "Adobe Careers", job_posted_at_datetime_utc: "2026-11-08T00:00:00.000Z", job_description: "Sell Creative Cloud\n\n to enterprise", job_min_salary: 1000000, job_max_salary: 2000000, job_salary_currency: "INR", job_salary_period: "YEAR" },
    { job_id: "2", job_title: "Software Engineer", employer_name: "Adobe Systems", job_apply_link: "https://careers.adobe.com/j/2" },
    { job_id: "3", job_title: "Sales Manager", employer_name: "Alpha India", job_apply_link: "https://example.com/j/3" },
    { job_id: "4", job_title: "No link", employer_name: "Adobe" },
    { job_id: "5", job_title: "Bad link", employer_name: "Adobe", job_apply_link: "http://insecure.example.com" },
  ] });
  assert.equal(cards.length, 3);
  assert.equal(cards[0].location, "Bengaluru, Karnataka, IN");
  assert.equal(cards[0].snippet, "Sell Creative Cloud to enterprise");
  assert.equal(cards[0].pay, "INR 1000000-2000000 per year");
  const { shown, hidden } = listingsForCompany(cards, "Adobe");
  assert.deepEqual(shown.map((c) => c.id), ["1"]);          // other employers are dropped; non-sales roles are counted, not shown
  assert.equal(hidden, 1);
  assert.deepEqual(parseJSearch(null), []);
});

test("company list counts roles per company and filters by status, India and attention", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  const counts = roleCounts([
    { company_id: "a", location: "Pune, India", created_at: "2026-11-08T00:00:00Z" },
    { company_id: "a", location: "London, UK", created_at: "2026-10-01T00:00:00Z" },
    { company_id: "b", location: "Remote", created_at: "2026-11-09T00:00:00Z" },
    { company_id: null, location: "Dubai", created_at: "2026-11-09T00:00:00Z" },
  ], now);
  assert.deepEqual(counts.get("a"), { roles: 2, inIndia: 1, newThisWeek: 1 });
  assert.deepEqual(counts.get("b"), { roles: 1, inIndia: 0, newThisWeek: 1 });
  assert.equal(counts.size, 2);                                              // roles with no company are ignored
  const row = (o: Partial<CompanyRow>): CompanyRow => ({ id: "x", name: "X", domain: null, atsType: "lever", hasBoard: true, enabled: true, error: null, lastCheckedAt: null, roles: 0, inIndia: 0, newThisWeek: 0, status: null, note: "", watching: false, ...o });
  const rows = [row({ id: "1", name: "Acme", inIndia: 2 }), row({ id: "2", name: "Globex", status: "interested" }), row({ id: "3", name: "Initech", status: "not_for_me" }), row({ id: "4", name: "Hooli", hasBoard: false }), row({ id: "5", name: "Umbrella", error: "timed out", status: "applied" })];
  assert.deepEqual(filterCompanies(rows, "all").map((c) => c.id), ["1", "2", "4", "5"]);   // "not for me" is hidden unless searched
  assert.deepEqual(filterCompanies(rows, "india").map((c) => c.id), ["1"]);
  assert.deepEqual(filterCompanies(rows, "interested").map((c) => c.id), ["2"]);
  assert.deepEqual(filterCompanies(rows, "attention").map((c) => c.id), ["4", "5"]);
  assert.deepEqual(filterCompanies(rows, "all", "init").map((c) => c.id), ["3"]);
  assert.equal(needsAttention(row({ enabled: false, hasBoard: false })), false);
  assert.deepEqual(filterCounts(rows), { all: 4, india: 1, interested: 1, applied: 1, attention: 2 });
});

test("a company with no job board gets its roles from listings in the common job shape", () => {
  const [card] = parseJSearch({ data: [{ job_id: "9", job_title: "Business Development Representative", employer_name: "Postman", job_city: "Bengaluru", job_country: "IN", job_apply_link: "https://careers.postman.com/j/9", job_publisher: "Postman Careers", job_posted_at_datetime_utc: "2026-11-09T00:00:00Z", job_description: "Outbound to developers", job_is_remote: false }] });
  const raw = listingToRaw(card);
  assert.equal(raw.board, "jsearch");
  assert.equal(raw.title, "Business Development Representative");
  assert.equal(raw.url, "https://careers.postman.com/j/9");
  assert.equal(raw.posted_at, "2026-11-09T00:00:00.000Z");
  assert.equal(raw.remote, false);
});

test("outreach message checks: words, subject options and the quality checklist", () => {
  const body = "Hi Priya,\n\nI saw the Senior SDR opening at Freshworks and wanted to ask you directly. I have booked meetings for enterprise teams for six years.\n\nIs it still open, and is it worth my applying?\n\nManzar\n\nIf this is not relevant, tell me and I will not write again.";
  assert.equal(wordCount(body), 37);                                           // the opt-out line is not counted
  const ok = messageChecks({ subject: "Priya, quick question", body, company: "Freshworks" });
  assert.ok(ok.checks.every((c) => c.ok), JSON.stringify(ok.checks.filter((c) => !c.ok)));
  const bad = messageChecks({ subject: "An extremely long subject line that nobody will read in full", body: "Hello, see https://x.com and the attached CV. Interested? Open? Hiring?", company: "Freshworks" });
  const failed = bad.checks.filter((c) => !c.ok).map((c) => c.id).sort();
  assert.deepEqual(failed, ["ask", "optout", "plain", "specific", "subject"]);
  assert.deepEqual(subjectOptions({ firstName: "Priya Nair", company: "Freshworks", role: "Senior SDR" }), ["Priya, quick question", "Senior SDR at Freshworks", "Your sales team at Freshworks"]);
  assert.equal(subjectOptions({ firstName: "", company: "Acme" })[0], "Quick question");
  assert.equal(isAngle("referral"), true);
  assert.equal(isAngle("spam"), false);
});

test("the outreach board places people by stage and puts today's follow-ups first", () => {
  const past = new Date(Date.now() - 864e5).toISOString(), future = new Date(Date.now() + 864e5).toISOString();
  const st = (id: string, i: number, channel: "email" | "linkedin_task", status: string, when: string | null) => ({ id, step_index: i, channel, status, scheduled_for: when });
  const c = (id: string, steps: ReturnType<typeof st>[], outcome: BoardContact["outcome"] = null): BoardContact => ({ id, name: id, title: null, company_name: "Co", outcome, steps });
  const fresh = c("fresh", [st("a", 0, "email", "draft", past)]);
  const waiting = c("waiting", [st("b", 0, "email", "sent", past), st("b2", 2, "email", "draft", future)]);
  const due = c("due", [st("d", 0, "email", "sent", past), st("d2", 2, "email", "draft", past)]);
  const replied = c("replied", [st("e", 0, "email", "replied", past)]);
  const call = c("call", [st("f", 0, "email", "replied", past)], "call_booked");
  const interview = c("interview", [st("g", 0, "email", "sent", past)], "referral");
  const declined = c("declined", [st("h", 0, "email", "sent", past)], "declined");
  const board = buildBoard([fresh, waiting, due, replied, call, interview, declined]);
  assert.deepEqual(board.columns.toContact.map((x) => x.id), ["fresh"]);
  assert.deepEqual(board.columns.waiting.map((x) => x.id), ["waiting", "due"]);
  assert.deepEqual(board.columns.replied.map((x) => x.id), ["replied"]);
  assert.deepEqual(board.columns.call.map((x) => x.id), ["call"]);       // what you recorded beats the reply
  assert.deepEqual(board.columns.interview.map((x) => x.id), ["interview"]);
  assert.equal(stageOf(declined), null);
  assert.deepEqual(board.followUps.map((x) => x.id), ["due"]);
  assert.deepEqual(board.needsAnswer.map((x) => x.id), ["replied"]);
});
