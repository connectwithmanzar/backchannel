import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRelevance, isRelevantRole, RELEVANT_TITLE_OR } from "../src/lib/relevance";

const yes = (title: string, company = "Acme Software", description = "") => assert.equal(isRelevantRole(title, company, description), true, title);
const no = (title: string, company = "Acme Software", description = "") => assert.equal(isRelevantRole(title, company, description), false, `${title} should not count`);

test("SDR, BDR and lead generation roles count", () => {
  for (const t of ["Sales Development Representative", "SDR", "Business Development Representative", "BDR - Outbound", "Business Development Executive", "Lead Generation Specialist",
    "Inside Sales Representative", "Market Development Representative", "Associate Business Development Representative", "Outbound Sales Representative", "Account Development Representative"]) yes(t);
});

test("GTM and revenue operations roles count", () => {
  for (const t of ["GTM Engineer", "Go-to-Market Operations Analyst", "GTM Operations Specialist", "Revenue Operations Specialist", "Growth Engineer", "Sales Operations Analyst"]) yes(t);
});

test("associate and mid-level Account Executives count, senior and enterprise ones do not", () => {
  for (const t of ["Account Executive", "Associate Account Executive", "Account Executive, Commercial", "Mid-Market Account Executive", "Account Executive - SMB", "Corporate Account Executive"]) yes(t);
  for (const t of ["Senior Account Executive", "Sr. Account Executive", "Enterprise Account Executive", "Strategic Account Executive", "Principal Account Executive", "Global Account Executive"]) no(t);
});

test("heads, directors, VPs and managers do not count", () => {
  for (const t of ["Head of Sales", "Head of Sales Development", "VP Sales", "Director of Business Development", "Sales Development Manager", "BDR Team Lead", "Business Development Manager", "Revenue Operations Manager", "Chief Revenue Officer"]) no(t);
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

test("titles that are not sales development, GTM or AE are out", () => {
  for (const t of ["Software Engineer", "Customer Success Manager", "Account Manager", "Solutions Engineer", "Marketing Manager", "Recruiter", "Sales Manager", ""]) no(t);
});

test("each result says why", () => {
  assert.equal(classifyRelevance("Sales Development Representative").kind, "SDR/BDR");
  assert.equal(classifyRelevance("GTM Engineer").kind, "GTM");
  assert.equal(classifyRelevance("Account Executive").kind, "Account Executive");
  assert.match(classifyRelevance("Sales Development Manager").reason, /leadership/);
  assert.match(classifyRelevance("Head of Sales").reason, /not an SDR/);
  assert.match(classifyRelevance("Senior Account Executive").reason, /senior/);
  assert.match(classifyRelevance("Business Development Executive - Home Loans").reason, /consumer/);
});

test("the database search filter covers every title pattern", () => {
  assert.match(RELEVANT_TITLE_OR, /title\.ilike\.%sdr%/);
  assert.match(RELEVANT_TITLE_OR, /title\.ilike\.%account executive%/);
  assert.equal(RELEVANT_TITLE_OR.split(",").length, 18);
});
