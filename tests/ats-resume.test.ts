import test from "node:test";
import assert from "node:assert/strict";
import { parseCvText, compileAtsResumePdf } from "../src/lib/pdf/ats-resume";
import { extractText } from "unpdf";

const SAMPLE_CV = `
# John Doe
john.doe@example.com | +1 (555) 123-4567 | San Francisco, CA | linkedin.com/in/johndoe

## Professional Summary
High-performing B2B SaaS Account Executive with 6 years experience closing mid-market and enterprise deals. Proven track record exceeding quota in fast-paced software startups.

## Experience
### Senior Account Executive | Supabase | Jan 2022 – Present | San Francisco, CA
- Exceeded annual quota at 142% ($1.2M ARR closed against $850k target).
- Sourced 45% of pipeline through outbound multi-channel prospecting using Clay, Apollo, and LinkedIn.
- Partnered with Solution Engineers to run technical evaluations and executive POCs.

### Business Development Representative | Datadog | 2020 – 2022 | Austin, TX
- Booked 18 qualified meetings per month against a target of 12 (150% attainment).
- Won top outbound rep award for Q3 2021 across the North America team.

## Core Competencies & Tools
- Tools: Salesforce, HubSpot, Clay, Apollo, Outreach, Gong, ZoomInfo.
- Sales Methodology: MEDDPICC, Command of the Message, Challenger Sale.

## Education
### Bachelor of Science in Business Administration | University of Texas at Austin | 2016 – 2020
`;

test("parseCvText extracts candidate contact info and sections properly", () => {
  const { contact, sections } = parseCvText(SAMPLE_CV);

  assert.equal(contact.name, "John Doe");
  assert.equal(contact.email, "john.doe@example.com");
  assert.equal(contact.phone, "+1 (555) 123-4567");
  assert.equal(contact.location, "San Francisco, CA");
  assert.equal(contact.linkedin, "linkedin.com/in/johndoe");

  assert.ok(sections.length >= 4);
  const titles = sections.map((s) => s.title);
  assert.ok(titles.some((t) => t.includes("EXPERIENCE")));
  assert.ok(titles.some((t) => t.includes("SUMMARY")));
  assert.ok(titles.some((t) => t.includes("EDUCATION")));
});

test("compileAtsResumePdf generates a valid ATS-compatible PDF and extracts text cleanly", async () => {
  const pdfBuffer = await compileAtsResumePdf(SAMPLE_CV);

  assert.ok(pdfBuffer instanceof Buffer);
  assert.ok(pdfBuffer.length > 1000);

  // Check PDF signature: %PDF-
  const header = pdfBuffer.subarray(0, 5).toString("utf-8");
  assert.equal(header, "%PDF-");

  // Verify extractability with unpdf (same as ATS parsers do)
  const { text } = await extractText(new Uint8Array(pdfBuffer));
  const fullText = Array.isArray(text) ? text.join(" ") : text;

  assert.ok(fullText.includes("JOHN DOE"));
  assert.ok(fullText.includes("Supabase"));
  assert.ok(fullText.includes("142%"));
  assert.ok(fullText.includes("MEDDPICC"));
});
