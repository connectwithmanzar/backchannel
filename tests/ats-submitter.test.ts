import test from "node:test";
import assert from "node:assert/strict";
import { identifyAts } from "../src/lib/auto-apply/ats-submitter";

test("identifyAts parses standard Greenhouse job URLs", () => {
  const res1 = identifyAts("https://boards.greenhouse.io/stripe/jobs/5234123");
  assert.equal(res1.provider, "greenhouse");
  assert.equal(res1.boardToken, "stripe");
  assert.equal(res1.jobId, "5234123");
  assert.equal(res1.submitUrl, "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/5234123");

  const res2 = identifyAts("https://job-boards.greenhouse.io/supabase/jobs/987654");
  assert.equal(res2.provider, "greenhouse");
  assert.equal(res2.boardToken, "supabase");
  assert.equal(res2.jobId, "987654");
  assert.equal(res2.submitUrl, "https://boards-api.greenhouse.io/v1/boards/supabase/jobs/987654");
});

test("identifyAts parses Lever job URLs", () => {
  const res = identifyAts("https://jobs.lever.co/figma/12345678-abcd-1234-ef01-123456789abc/apply");
  assert.equal(res.provider, "lever");
  assert.equal(res.boardToken, "figma");
  assert.equal(res.jobId, "12345678-abcd-1234-ef01-123456789abc");
  assert.equal(res.submitUrl, "https://api.lever.co/v0/postings/figma/12345678-abcd-1234-ef01-123456789abc");
});

test("identifyAts identifies Ashby and Workday", () => {
  const ashby = identifyAts("https://jobs.ashbyhq.com/linear/55443322");
  assert.equal(ashby.provider, "ashby");
  assert.equal(ashby.boardToken, "linear");

  const workday = identifyAts("https://salesforce.wd1.myworkdayjobs.com/en-US/External_Career_Site/job/Austin-TX/Account-Executive_JR123");
  assert.equal(workday.provider, "workday");
});
