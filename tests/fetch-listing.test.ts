import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, extractListing, fromLinkUrl, isPrivateAddress } from "../src/lib/jobs/fetch-listing";

const LD = `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "JobPosting", title: "Sales Development Representative",
  hiringOrganization: { "@type": "Organization", name: "Freshworks" },
  jobLocation: { "@type": "Place", address: { addressLocality: "Chennai", addressRegion: "Tamil Nadu", addressCountry: "IN" } },
  description: "<p>Own outbound pipeline for mid-market SaaS accounts.</p><ul><li>Prospect daily</li></ul>",
  baseSalary: { "@type": "MonetaryAmount", currency: "INR", value: { "@type": "QuantitativeValue", minValue: 800000, maxValue: 1200000, unitText: "YEAR" } },
})}</script></head><body>hi</body></html>`;

test("a job page with structured data gives title, company, place, description and pay", () => {
  const l = extractListing(LD, "https://careers.example.com/job/1");
  assert.equal(l.title, "Sales Development Representative");
  assert.equal(l.company, "Freshworks");
  assert.equal(l.location, "Chennai, Tamil Nadu, IN");
  assert.match(l.text, /outbound pipeline/);
  assert.match(l.text, /Pay: INR 800000-1200000 per year/);
  assert.equal(l.blocked, false);
  assert.deepEqual(l.from, ["page-data"]);
});

test("structured data inside a graph, with a remote job, is read too", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebSite" }, { "@type": ["JobPosting"], title: "GTM Engineer", hiringOrganization: "Acme", jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { name: "India" }, description: "Build workflows" }] })}</script>`;
  const l = extractListing(html, "https://x.com/j");
  assert.equal(l.title, "GTM Engineer");
  assert.equal(l.company, "Acme");
  assert.equal(l.location, "Remote, India");
});

test("a LinkedIn page title gives company, role and place", () => {
  const html = `<html><head><meta property="og:title" content="Zeta hiring Business Development Representative in Bengaluru, Karnataka, India | LinkedIn"></head><body>Sign in to view more</body></html>`;
  const l = extractListing(html, "https://www.linkedin.com/jobs/view/3812345678/");
  assert.equal(l.company, "Zeta");
  assert.equal(l.title, "Business Development Representative");
  assert.equal(l.location, "Bengaluru, Karnataka, India");
  assert.equal(l.text, "");
  assert.equal(l.blocked, true);          // no description: the owner is asked to paste it
});

test("LinkedIn's public page: heading, company, place and description come from its own markup", () => {
  const html = `<html><head><title>Senior Sales Operations Analyst at Kaseya | LinkedIn</title></head><body>
    <h1 class="top-card-layout__title font-sans">Sales Development Representative</h1>
    <a class="topcard__org-name-link topcard__flavor--black-link" href="/company/x">Kaseya</a>
    <span class="topcard__flavor topcard__flavor--bullet">Bengaluru, Karnataka, India</span>
    <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5">You will <strong>prospect</strong> daily and book meetings with mid-market IT teams across India. We use Salesforce and Outreach. Strong written English required.</div>
    <div>Sign in to view more jobs</div></body></html>`;
  const l = extractListing(html, "https://www.linkedin.com/jobs/view/3812345678");
  assert.equal(l.title, "Sales Development Representative");
  assert.equal(l.company, "Kaseya");
  assert.equal(l.location, "Bengaluru, Karnataka, India");
  assert.match(l.text, /prospect daily and book meetings/);
  assert.doesNotMatch(l.text, /Sign in to view/);
  assert.equal(l.blocked, false);
});

test("when LinkedIn shows only a heading like 'Title at Company', it is split", () => {
  const l = extractListing(`<html><head><title>Senior Sales Operations Analyst at Kaseya | LinkedIn</title></head><body></body></html>`, "https://www.linkedin.com/jobs/view/3812345678");
  assert.equal(l.title, "Senior Sales Operations Analyst");
  assert.equal(l.company, "Kaseya");
});

test("the title and company can come from a LinkedIn link alone", () => {
  assert.deepEqual(fromLinkUrl("https://www.linkedin.com/jobs/view/sales-development-representative-at-acme-corp-3812345678"), { title: "Sales Development Representative", company: "Acme Corp" });
  assert.deepEqual(fromLinkUrl("https://in.linkedin.com/jobs/view/gtm-engineer-3812345678/"), { title: "Gtm Engineer", company: null });
  assert.deepEqual(fromLinkUrl("https://www.indeed.com/viewjob?jk=abc"), { title: null, company: null });
  assert.deepEqual(fromLinkUrl("not a link"), { title: null, company: null });
});

test("a sign-in, captcha or error page is reported as blocked and never saved as the job text", () => {
  const l = extractListing("<html><title>Just a moment...</title><body>Verify you are human. Enable JavaScript and cookies to continue.</body></html>", "https://x.com/j");
  assert.equal(l.blocked, true);
  assert.equal(l.text, "");
  assert.equal(l.title, null);
});

test("a plain page with enough visible text is used when it has no structured data", () => {
  const body = "Responsibilities: ".concat("prospect and book meetings for the sales team. ".repeat(20));
  const l = extractListing(`<html><head><title>Sales Development Rep - Acme</title></head><body><p>${body}</p></body></html>`, "https://acme.com/careers/1");
  assert.equal(l.title, "Sales Development Rep");
  assert.ok(l.text.length > 400);
  assert.equal(l.blocked, false);
});

test("private and internal addresses are refused", async () => {
  for (const a of ["127.0.0.1", "10.0.0.5", "172.16.4.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(isPrivateAddress(a), false, a);
  for (const link of ["http://example.com/j", "https://localhost/j", "https://127.0.0.1/j", "https://169.254.169.254/latest/meta-data", "https://user:pw@example.com/j", "https://example.com:8443/j", "https://intranet/j", "https://box.internal/j", "https://[::1]/j"]) {
    await assert.rejects(assertPublicUrl(link), (e: unknown) => e instanceof Error, link);
  }
  await assert.doesNotReject(assertPublicUrl("https://8.8.8.8/x"));
});
