import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scrubAiClichés,
  generateHumanAtsAnswer,
  type CandidatePersona,
} from "../src/lib/auto-apply/ats-answerer";

describe("ats-answerer", () => {
  const mockPersona: CandidatePersona = {
    name: "Manzar Imam",
    currentRole: "Advertiser Growth & Outbound Specialist",
    yearsInSales: 5,
    quotaAttainmentPct: 110,
    meetingsPerMonth: 14,
    segment: "Enterprise",
    motion: "Outbound",
    tools: ["Salesforce", "Clay", "HubSpot", "Apollo"],
    gapLine: "",
    cvText: "Manzar Imam. 5 years GTM experience. Scaled $2M+ pipeline, $350K closed-won at Taboola.",
    stories: [
      {
        title: "Cold account to $500K partnership",
        situation: "Cold target account with zero prior engagement.",
        action: "Used Clay and Similarweb to pinpoint traffic acquisition leakage and delivered account-tailored pitch.",
        result: "Converted to $500K late-stage enterprise partnership.",
      },
    ],
    savedAnswers: {
      visa_sponsorship: "No sponsorship required; authorized to work in India and remotely.",
      salary_expectation: "$85,000 - $110,000 base + commission",
      notice_period: "30 days",
    },
  };

  it("scrubs AI clichés and robotic throat-clearing", () => {
    const robotic = "I am thrilled to apply for this role. Throughout my professional journey, it is a testament to my dedication. In conclusion, I spearheaded the initiative.";
    const cleaned = scrubAiClichés(robotic);
    assert.doesNotMatch(cleaned, /I am thrilled to apply for/i);
    assert.doesNotMatch(cleaned, /testament to/i);
    assert.doesNotMatch(cleaned, /spearheaded/i);
    assert.doesNotMatch(cleaned, /in conclusion/i);
  });

  it("answers sensitive questions directly from saved standing answers", async () => {
    const res = await generateHumanAtsAnswer(
      "Will you now or in the future require visa sponsorship?",
      mockPersona,
      { title: "Enterprise AE", company: "Acme" }
    );
    assert.equal(res.needsYou, false);
    assert.equal(res.isSensitive, true);
    assert.equal(res.sensitiveKey, "visa_sponsorship");
    assert.match(res.answer, /No sponsorship required/);
  });

  it("matches sensitive questions against dropdown options", async () => {
    const res = await generateHumanAtsAnswer(
      "What is your earliest availability / notice period?",
      mockPersona,
      { title: "GTM Lead", company: "Acme" },
      { kind: "select", options: ["Immediate", "2 weeks", "30 days", "2+ months"] }
    );
    assert.equal(res.needsYou, false);
    assert.equal(res.answer, "30 days");
  });

  it("flags missing sensitive questions when candidate has not saved an answer", async () => {
    const incompletePersona = { ...mockPersona, savedAnswers: {} };
    const res = await generateHumanAtsAnswer(
      "What are your salary expectations for this role?",
      incompletePersona,
      { title: "Account Executive", company: "Acme" }
    );
    assert.equal(res.needsYou, true);
    assert.match(res.reason || "", /standing answer/i);
  });

  it("matches standard years of experience questions against dropdown options", async () => {
    const res = await generateHumanAtsAnswer(
      "How many years of B2B sales experience do you have?",
      mockPersona,
      { title: "Senior SDR", company: "Acme" },
      { kind: "select", options: ["0-1 years", "1-3 years", "5+ years", "10+ years"] }
    );
    assert.equal(res.needsYou, false);
    assert.equal(res.answer, "5+ years");
  });
});
