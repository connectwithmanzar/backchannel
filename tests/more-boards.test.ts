import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkable, parseRecruitee, splitOtherSlug, slugCandidates } from "../src/lib/collectors/ats";
import { parseAtsUrl, boardName } from "../src/lib/websearch";

// Shapes copied from real responses on 12 Nov 2026 (Workable's widget and Recruitee's public offers).
const WORKABLE = {
  name: "Hugging Face", description: "x",
  jobs: [
    { title: "Sales Development Representative", shortcode: "81B46579FE", url: "https://apply.workable.com/j/81B46579FE", telecommuting: true, published_on: "2026-05-29", country: "France", city: "Paris", state: "Île-de-France", description: "<p>Outbound</p>" },
    { title: "Account Executive", shortcode: "AAA", url: "https://apply.workable.com/j/AAA", telecommuting: false, published_on: "2026-06-01", country: "India", city: "Pune", state: "" },
    { shortcode: "BAD" },
  ],
};
const RECRUITEE = {
  offers: [
    { id: 2821648, title: "Business Development Representative", careers_url: "https://careers.bunq.com/o/bdr", city: "Amsterdam", country: "Netherlands", remote: false, created_at: "2026-11-10 07:31:31 UTC", description: "<p>Pipeline</p>" },
    { id: 2, title: "Reporting Agent", careers_url: "https://careers.bunq.com/o/ra", city: "Paris", country: "France", remote: true, created_at: "2026-11-09 07:31:31 UTC", location: "Remote job" },
    { id: 3, title: "No link", city: "X" },
  ],
};

test("Workable jobs are read into the common shape, and rows without a title are dropped", () => {
  const jobs = parseWorkable(WORKABLE, "huggingface");
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Sales Development Representative");
  assert.equal(jobs[0].url, "https://apply.workable.com/j/81B46579FE");
  assert.equal(jobs[0].location, "Paris, Île-de-France, France");
  assert.equal(jobs[0].remote, true);
  assert.equal(jobs[0].board, "workable");
  assert.equal(jobs[1].location, "Pune, India");
  assert.equal(jobs[1].remote, false);
  assert.equal(jobs[1].posted_at, "2026-06-01");
});

test("Recruitee offers are read into the common shape, and offers without a link are dropped", () => {
  const jobs = parseRecruitee(RECRUITEE);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].url, "https://careers.bunq.com/o/bdr");
  assert.equal(jobs[0].location, "Amsterdam, Netherlands");
  assert.equal(jobs[0].board, "recruitee");
  assert.equal(jobs[0].remote, false);
  assert.equal(jobs[1].remote, true);
  assert.deepEqual(parseRecruitee(null), []);
  assert.deepEqual(parseWorkable({}, "x"), []);
});

test("a board stored as 'other' names its system in the slug", () => {
  assert.deepEqual(splitOtherSlug("workable:huggingface"), { kind: "workable", slug: "huggingface" });
  assert.deepEqual(splitOtherSlug("recruitee:bunq"), { kind: "recruitee", slug: "bunq" });
  assert.equal(splitOtherSlug("greenhouse:acme"), null);
  assert.equal(splitOtherSlug("workable:"), null);
  assert.equal(splitOtherSlug("nonsense"), null);
});

test("company search links to Workable and Recruitee boards are recognised", () => {
  assert.deepEqual(parseAtsUrl("https://apply.workable.com/huggingface/j/81B46579FE/"), { ats: "other", slug: "workable:huggingface" });
  assert.deepEqual(parseAtsUrl("https://bunq.recruitee.com/o/some-job"), { ats: "other", slug: "recruitee:bunq" });
  assert.equal(parseAtsUrl("https://apply.workable.com/j/81B46579FE"), null);          // a bare job link has no company name
  assert.equal(parseAtsUrl("https://www.recruitee.com/pricing"), null);
  assert.deepEqual(parseAtsUrl("https://boards.greenhouse.io/stripe/jobs/1"), { ats: "greenhouse", slug: "stripe" });
  assert.equal(boardName({ ats: "other", slug: "workable:hugging-face" }), "Hugging Face");
});

test("the same slug guesses are used for the new systems", () => {
  assert.ok(slugCandidates("Hugging Face", "huggingface.co").includes("huggingface"));
});
