import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAshby, parseGreenhouse, parseLever } from "../src/lib/collector/fetchers";
import { normalize, parsePay, roleFamily, market, remoteType, visa, dedupe } from "../src/lib/collector/normalize";
import type { Job } from "../src/lib/collector/types";

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/${n}.json`, "utf8"));
const keep = (xs: (Job | null)[]) => xs.filter((j): j is Job => j !== null);

test("role filter keeps sales roles and drops others", () => {
  assert.equal(roleFamily("Sales Development Representative"), "SDR/BDR");
  assert.equal(roleFamily("Senior BDR, DACH"), "SDR/BDR");
  assert.equal(roleFamily("GTM Engineer"), "GTM Engineer");
  assert.equal(roleFamily("Account Executive, SMB"), "Account Executive");
  assert.equal(roleFamily("Director of Sales Development"), "Sales leadership");
  assert.equal(roleFamily("Senior Software Engineer"), null);
  assert.equal(roleFamily("Sales Engineer"), null);
  assert.equal(roleFamily("Technical Recruiter"), null);
});

test("pay parsing handles common formats", () => {
  assert.deepEqual(parsePay("range is €45,000 - €55,000 plus"), { currency: "EUR", min: 45000, max: 55000 });
  assert.deepEqual(parsePay("$120K – $150K"), { currency: "USD", min: 120000, max: 150000 });
  assert.deepEqual(parsePay("GBP 60000 - 75000"), { currency: "GBP", min: 60000, max: 75000 });
  assert.deepEqual(parsePay("₹12L - ₹18L"), { currency: "INR", min: 1200000, max: 1800000 });
  assert.deepEqual(parsePay("no pay here"), {});
});

test("location maps to market and remote type", () => {
  assert.equal(market("Bengaluru, India", "onsite"), "india");
  assert.equal(market("Remote - India", "remote"), "remote-in");
  assert.equal(market("Dublin, Ireland", "hybrid"), "emea");
  assert.equal(market("New York, NY", "onsite"), "us");
  assert.equal(remoteType("Remote", false), "remote");
  assert.equal(remoteType("London", false, "This is a hybrid role"), "hybrid");
});

test("visa detection", () => {
  assert.equal(visa("We are unable to sponsor visas."), "no");
  assert.equal(visa("Visa sponsorship is available."), "yes");
  assert.equal(visa("Great team."), "unknown");
});

test("greenhouse fixture → 2 sales roles with pay and market", () => {
  const jobs = keep(parseGreenhouse({ name: "Acme", ats: "greenhouse", slug: "acme" }, fx("greenhouse")).map((r) => normalize(r)));
  assert.equal(jobs.length, 2);
  const sdr = jobs.find((j) => j.title.startsWith("Sales Development"))!;
  assert.equal(sdr.market, "emea");
  assert.equal(sdr.remoteType, "hybrid");
  assert.equal(sdr.currency, "EUR");
  assert.equal(sdr.payBandStatus, "verified");
  assert.equal(jobs.find((j) => j.title.startsWith("Business"))!.market, "india");
});

test("lever fixture → AE with GBP range and no-sponsorship flag", () => {
  const jobs = keep(parseLever({ name: "Beta", ats: "lever", slug: "beta" }, fx("lever")).map((r) => normalize(r)));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].roleFamily, "Account Executive");
  assert.equal(jobs[0].payMin, 60000);
  assert.equal(jobs[0].visaSponsorship, "no");
});

test("ashby fixture → skips unlisted, parses comp and remote", () => {
  const jobs = keep(parseAshby({ name: "Gamma", ats: "ashby", slug: "gamma" }, fx("ashby")).map((r) => normalize(r)));
  assert.equal(jobs.length, 2);
  const gtm = jobs.find((j) => j.roleFamily === "GTM Engineer")!;
  assert.equal(gtm.remoteType, "remote");
  assert.equal(gtm.payMax, 150000);
  assert.equal(gtm.visaSponsorship, "yes");
});

test("dedupe removes repeats of the same company + title + location", () => {
  const raw = parseGreenhouse({ name: "Acme", ats: "greenhouse", slug: "acme" }, fx("greenhouse"));
  const jobs = keep([...raw, ...raw].map((r) => normalize(r)));
  assert.equal(dedupe(jobs).length, 2);
});
