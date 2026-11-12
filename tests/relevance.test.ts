import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRelevance, isRelevantRole, RELEVANT_TITLE_OR, RELEVANT_TITLE_PATTERNS } from "../src/lib/relevance";

const yes = (title: string, company = "Acme", description = "") => assert.equal(isRelevantRole(title, company, description), true, title);
const no = (title: string, company = "Acme", description = "") => assert.equal(isRelevantRole(title, company, description), false, `${title} should not count`);

test("SDR and BDR roles count at every level, including senior", () => {
  for (const t of ["Sales Development Representative", "SDR", "Senior SDR", "Senior Sales Development Representative", "Senior Business Development Representative", "Sr. BDR",
    "Business Development Representative", "BDR - Outbound", "Business Development Executive", "Associate Business Development Representative", "Lead Generation Specialist",
    "Lead Generation Executive", "Market Development Representative", "Outbound Sales Representative", "Account Development Representative"]) yes(t);
});

test("any GTM or revenue operations role counts, except heads, VPs and directors", () => {
  for (const t of ["GTM Engineer", "GTM Manager", "GTM Lead", "Go-to-Market Operations Analyst", "GTM Operations Specialist", "Revenue Operations Specialist", "Revenue Operations Manager", "Growth Engineer", "Sales Operations Analyst"]) yes(t);
  for (const t of ["Head of GTM", "VP, Go-to-Market", "Director of Revenue Operations"]) no(t);
});

test("inside sales associates and executives count", () => {
  for (const t of ["Inside Sales Executive", "Inside Sales Associate", "Inside Sales Representative", "Associate, Inside Sales", "Senior Inside Sales Executive"]) yes(t);
  no("Inside Sales Manager");
});

test("B2B sales that is not leadership counts: account executives of any level", () => {
  for (const t of ["Account Executive", "Associate Account Executive", "Senior Account Executive", "Enterprise Account Executive", "Strategic Account Executive", "Mid-Market Account Executive", "Account Executive - SMB", "Senior Account Executive - Inside Sales"]) yes(t);
});

test("a plain sales title counts only when something shows it is B2B", () => {
  yes("B2B Sales Executive");
  yes("Corporate Sales Executive");
  yes("Enterprise Sales Representative");
  yes("Sales Executive", "Acme Software");
  yes("Sales Representative", "Acme", "We sell workflow software to IT teams.");
  no("Sales Executive", "Acme Traders");
  no("Sales Associate", "Acme");
});

test("SaaS sales counts", () => {
  for (const t of ["SaaS Sales Executive", "Sales Executive - SaaS", "Sales Representative, SaaS", "Business Development Associate - SaaS"]) yes(t);
});

test("advertising sales counts", () => {
  for (const t of ["Advertising Sales Executive", "Ad Sales Specialist", "Media Sales Executive", "Programmatic Sales Specialist", "Advertiser Sales Associate", "Sales Executive, Advertising"]) yes(t);
  no("Ad Sales Manager");
  no("Head of Advertising Sales");
});

test("heads, directors, VPs, managers and team leads do not count", () => {
  for (const t of ["Head of Sales", "Head of Sales Development", "VP Sales", "Director of Business Development", "Sales Development Manager", "BDR Team Lead", "Business Development Manager", "Sales Manager", "Chief Revenue Officer", "Regional Sales Manager"]) no(t);
});

test("'lead generation' is not mistaken for a team lead", () => {
  yes("Lead Generation Executive");
  yes("Lead Development Representative");
});

test("consumer-facing and field selling is not B2B", () => {
  for (const t of ["Personal Loan Sales Executive", "Business Development Executive - Home Loans", "Insurance Sales Executive", "Field Sales Executive", "Telecaller", "Business Development Executive - Retail Branch",
    "Inside Sales Executive - Admissions Counsellor", "Walk-in Business Development Executive"]) no(t);
  no("Business Development Executive", "HDFC Bank");
  no("Inside Sales Representative", "Prestige Realty");
});

test("a description that says B2C and never B2B rules a role out; B2B wins", () => {
  no("Business Development Executive", "Acme", "Sell our app directly to customers. This is a B2C role.");
  yes("Business Development Executive", "Acme", "B2B SaaS. We also have a B2C product.");
});

test("pre-sales, support and other non-selling titles are out", () => {
  for (const t of ["Software Engineer", "Customer Success Manager", "Account Manager", "Solutions Engineer", "Sales Engineer", "Marketing Manager", "Recruiter", "Sales Enablement Manager", ""]) no(t);
});

test("each result says what kind of role it is, and why when it is out", () => {
  assert.equal(classifyRelevance("Sales Development Representative").kind, "SDR/BDR");
  assert.equal(classifyRelevance("GTM Engineer").kind, "GTM");
  assert.equal(classifyRelevance("Account Executive").kind, "Account Executive");
  assert.equal(classifyRelevance("Inside Sales Executive").kind, "Inside sales");
  assert.equal(classifyRelevance("SaaS Sales Executive").kind, "SaaS sales");
  assert.equal(classifyRelevance("Media Sales Executive").kind, "Ad sales");
  assert.equal(classifyRelevance("B2B Sales Executive").kind, "B2B sales");
  assert.match(classifyRelevance("Sales Development Manager").reason, /leadership/);
  assert.match(classifyRelevance("Head of Sales").reason, /not one of your kinds/);
  assert.match(classifyRelevance("Business Development Executive - Home Loans").reason, /consumer/);
  assert.match(classifyRelevance("Sales Engineer").reason, /not a selling role/);
});

test("the database search filter covers every title pattern", () => {
  assert.match(RELEVANT_TITLE_OR, /title\.ilike\.%sdr%/);
  assert.match(RELEVANT_TITLE_OR, /title\.ilike\.%account executive%/);
  assert.match(RELEVANT_TITLE_OR, /title\.ilike\.%saas%/);
  assert.match(RELEVANT_TITLE_OR, /title\.ilike\.%advertis%/);
  assert.equal(RELEVANT_TITLE_OR.split(",").length, RELEVANT_TITLE_PATTERNS.length);
});
