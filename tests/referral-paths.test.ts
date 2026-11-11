import { test } from "node:test";
import assert from "node:assert/strict";
import { companyKey, sameCompany, matchConnections, managerTitleFor, referralSearchLinks, connectionRank, type Connection } from "../src/lib/jobs/referral-paths";

const c = (full_name: string, company: string | null, position: string | null, connected_on: string | null = null): Connection => ({ full_name, company, position, linkedin_url: null, connected_on });

test("referral: company keys drop legal suffixes and punctuation", () => {
  assert.equal(companyKey("Careem Networks FZ-LLC"), "careem networks");
  assert.equal(companyKey("HubSpot, Inc."), "hubspot");
  assert.equal(companyKey("Razorpay Software Pvt. Ltd."), "razorpay software");
});

test("referral: same company matches prefixes at word boundaries only", () => {
  assert.ok(sameCompany("HubSpot", "HubSpot India Operations"));
  assert.ok(sameCompany("Careem", "Careem Networks FZ LLC"));
  assert.ok(!sameCompany("Hub", "HubSpot"));
  assert.ok(!sameCompany("Meta", "Metabase"));
  assert.ok(!sameCompany("", "Acme"));
});

test("referral: connections ranked sales > seniority > recent, employer never shown", () => {
  const all = [
    c("Ana", "Careem", "Software Engineer", "2025-01-01"),
    c("Bo", "Careem Networks", "Head of Sales", "2019-01-01"),
    c("Cy", "Careem", "Talent Partner", "2026-01-01"),
    c("Di", "Taboola", "Sales Director"),
    c("Ed", "Uber", "Sales"),
  ];
  assert.deepEqual(matchConnections(all, "Careem").map((x) => x.full_name), ["Bo", "Cy", "Ana"]);
  assert.deepEqual(matchConnections(all, "Taboola"), []);
  assert.ok(connectionRank(c("x", "a", "BDR")) > connectionRank(c("y", "a", "Engineer")));
});

test("referral: hiring manager title and search links", () => {
  assert.match(managerTitleFor("Senior SDR"), /Sales Development Manager/);
  assert.match(managerTitleFor("Account Executive, UAE"), /Head of Sales/);
  const links = referralSearchLinks("Careem", "BDR", ["Taboola", "Careem", "Zomato"], "IIM Lucknow");
  assert.equal(links.length, 4); // manager + Taboola + Zomato (own company skipped) + alumni
  assert.ok(links.every((l) => l.url.startsWith("https://www.linkedin.com/search/results/people/?keywords=")));
  assert.ok(links[3].label.includes("IIM Lucknow alumni"));
  assert.deepEqual(referralSearchLinks("Taboola", "SDR", [], null), []);
});
