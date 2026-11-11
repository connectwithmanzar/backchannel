import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCompanyName } from "../src/lib/company-name";
import { sourceLabel } from "../src/lib/role-filters";

test("names made from job-board addresses are put right", () => {
  assert.equal(formatCompanyName("thomsonreuters"), "Thomson Reuters");
  assert.equal(formatCompanyName("Motorolasolutions"), "Motorola Solutions");
  assert.equal(formatCompanyName("Hpe"), "HPE");
  assert.equal(formatCompanyName("3m"), "3M");
  assert.equal(formatCompanyName("adobe"), "Adobe");
  assert.equal(formatCompanyName("Sailpoint"), "SailPoint");
  assert.equal(formatCompanyName("mongodb"), "MongoDB");
});

test("splits joined-up names on common endings, and title-cases the rest", () => {
  assert.equal(formatCompanyName("acmesolutions"), "Acme Solutions");
  assert.equal(formatCompanyName("globex-corp"), "Globex Corp");
  assert.equal(formatCompanyName("some_new_startup"), "Some New Startup");
  assert.equal(formatCompanyName("plaid"), "Plaid");
});

test("names already written properly, and empty names, are left alone", () => {
  assert.equal(formatCompanyName("Career One Stop"), "Career One Stop");
  assert.equal(formatCompanyName("MongoDB"), "MongoDB");
  assert.equal(formatCompanyName("LinkedIn"), "LinkedIn");
  assert.equal(formatCompanyName(""), "");
  assert.equal(formatCompanyName(null), "");
  assert.equal(formatCompanyName("  Stripe "), "Stripe");
});

test("job sources read as plain words, never as a raw board code", () => {
  assert.equal(sourceLabel("workday"), "Company careers page");
  assert.equal(sourceLabel("greenhouse"), "Company careers page");
  assert.equal(sourceLabel("pasted"), "Added by you");
  assert.equal(sourceLabel("jobradar:linkedin"), "JobRadar · LinkedIn");
  assert.equal(sourceLabel("jobradar:naukri"), "JobRadar · Naukri");
  assert.equal(sourceLabel("jsearch"), "Job listings");
  assert.equal(sourceLabel("something-new"), "Other source");
});
