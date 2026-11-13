import { compileAtsResumePdf, type ContactInfo } from "@/lib/pdf/ats-resume";
import type { FormProfile } from "@/lib/auto-apply";

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "workday" | "other";

export interface AtsTarget {
  provider: AtsProvider;
  boardToken?: string;
  jobId?: string;
  submitUrl?: string;
}

export interface SubmissionPayload {
  profile: FormProfile;
  coverNote?: string;
  tailoredCvText: string;
  answers?: Record<string, string>;
  customQuestions?: { q: string; answer: string; key?: string }[];
}

export interface SubmissionResult {
  ok: boolean;
  provider: AtsProvider;
  method: "direct_api" | "browser_autofill";
  receipt?: string;
  error?: string;
  directSubmitSupported: boolean;
}

/**
 * Detects ATS provider and extracts board token and job ID from a job URL.
 */
export function identifyAts(rawUrl: string): AtsTarget {
  if (!rawUrl) return { provider: "other" };

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // 1. Greenhouse
    // e.g. boards.greenhouse.io/stripe/jobs/12345 or job-boards.greenhouse.io/stripe/jobs/12345
    if (host.includes("greenhouse.io")) {
      const match = pathname.match(/(?:\/boards\/|\/embed\/job_app\?for=|\/)([a-zA-Z0-9_\-]+)\/jobs\/(\d+)/i) ||
                    pathname.match(/^\/([a-zA-Z0-9_\-]+)\/jobs\/(\d+)/i);
      if (match) {
        return {
          provider: "greenhouse",
          boardToken: match[1],
          jobId: match[2],
          submitUrl: `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs/${match[2]}`,
        };
      }
      const ghJid = url.searchParams.get("gh_jid");
      const board = pathname.split("/").filter(Boolean)[0];
      if (ghJid && board) {
        return {
          provider: "greenhouse",
          boardToken: board,
          jobId: ghJid,
          submitUrl: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${ghJid}`,
        };
      }
      return { provider: "greenhouse" };
    }

    // 2. Lever
    // e.g. jobs.lever.co/company-slug/uuid-uuid-uuid
    if (host.includes("lever.co")) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const company = parts[0];
        const jobId = parts[1].replace(/\/apply$/, "");
        return {
          provider: "lever",
          boardToken: company,
          jobId: jobId,
          submitUrl: `https://api.lever.co/v0/postings/${company}/${jobId}`,
        };
      }
      return { provider: "lever" };
    }

    // 3. Ashby
    if (host.includes("ashbyhq.com")) {
      const parts = pathname.split("/").filter(Boolean);
      return {
        provider: "ashby",
        boardToken: parts[0],
        jobId: parts[1],
      };
    }

    // 4. Workday
    if (host.includes("myworkdayjobs.com")) {
      return { provider: "workday" };
    }

    return { provider: "other" };
  } catch {
    return { provider: "other" };
  }
}

/**
 * Submits an application directly to Greenhouse via its public job board REST API.
 */
export async function submitGreenhouse(
  target: AtsTarget,
  payload: SubmissionPayload,
  pdfBuffer: Buffer
): Promise<SubmissionResult> {
  if (!target.boardToken || !target.jobId || !target.submitUrl) {
    return {
      ok: false,
      provider: "greenhouse",
      method: "direct_api",
      directSubmitSupported: true,
      error: "Missing Greenhouse board token or job ID.",
    };
  }

  const formData = new FormData();
  formData.append("first_name", payload.profile.first_name);
  formData.append("last_name", payload.profile.last_name || "Applicant");
  formData.append("email", payload.profile.email);
  if (payload.profile.phone) formData.append("phone", payload.profile.phone);

  const cleanName = (payload.profile.full_name || "Resume").replace(/[^a-zA-Z0-9]/g, "_");
  const resumeBlob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
  formData.append("resume", resumeBlob, `${cleanName}_Resume.pdf`);

  if (payload.coverNote) {
    formData.append("cover_letter_text", payload.coverNote);
  }

  // Common URLs
  if (payload.profile.linkedin_url) formData.append("url_linkedin", payload.profile.linkedin_url);
  if (payload.profile.website) formData.append("url_website", payload.profile.website);

  // Map custom questions if present
  if (payload.customQuestions) {
    payload.customQuestions.forEach((q, idx) => {
      if (q.answer) {
        formData.append(`question_${idx}`, q.answer);
      }
    });
  }

  try {
    const res = await fetch(target.submitUrl, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: true,
        provider: "greenhouse",
        method: "direct_api",
        directSubmitSupported: true,
        receipt: `Greenhouse Application Received (${res.status} OK) [ID: ${target.jobId}]`,
      };
    }

    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      provider: "greenhouse",
      method: "direct_api",
      directSubmitSupported: true,
      error: `Greenhouse returned ${res.status}: ${errText.slice(0, 300)}`,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "greenhouse",
      method: "direct_api",
      directSubmitSupported: true,
      error: (err as Error).message,
    };
  }
}

/**
 * Submits an application directly to Lever via its public REST API.
 */
export async function submitLever(
  target: AtsTarget,
  payload: SubmissionPayload,
  pdfBuffer: Buffer
): Promise<SubmissionResult> {
  if (!target.boardToken || !target.jobId || !target.submitUrl) {
    return {
      ok: false,
      provider: "lever",
      method: "direct_api",
      directSubmitSupported: true,
      error: "Missing Lever company slug or job ID.",
    };
  }

  const formData = new FormData();
  formData.append("name", payload.profile.full_name);
  formData.append("email", payload.profile.email);
  if (payload.profile.phone) formData.append("phone", payload.profile.phone);
  if (payload.profile.location) formData.append("org", payload.profile.location);

  const cleanName = (payload.profile.full_name || "Resume").replace(/[^a-zA-Z0-9]/g, "_");
  const resumeBlob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
  formData.append("resume", resumeBlob, `${cleanName}_Resume.pdf`);

  if (payload.coverNote) {
    formData.append("comments", payload.coverNote);
  }

  if (payload.profile.linkedin_url) formData.append("urls[LinkedIn]", payload.profile.linkedin_url);
  if (payload.profile.website) formData.append("urls[Portfolio]", payload.profile.website);

  try {
    const res = await fetch(target.submitUrl, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        provider: "lever",
        method: "direct_api",
        directSubmitSupported: true,
        receipt: `Lever Application Submitted (${res.status} OK) [Posting: ${target.jobId}]`,
      };
    }

    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      provider: "lever",
      method: "direct_api",
      directSubmitSupported: true,
      error: `Lever returned ${res.status}: ${errText.slice(0, 300)}`,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "lever",
      method: "direct_api",
      directSubmitSupported: true,
      error: (err as Error).message,
    };
  }
}

/**
 * Universal Auto-Apply Orchestrator:
 * - Direct API for Greenhouse & Lever
 * - Falls back to browser autofill instructions for other platforms
 */
export async function executeAutoApply(
  jobUrl: string,
  payload: SubmissionPayload
): Promise<SubmissionResult> {
  const target = identifyAts(jobUrl);

  const contact: ContactInfo = {
    name: payload.profile.full_name,
    email: payload.profile.email,
    phone: payload.profile.phone,
    location: payload.profile.location,
    linkedin: payload.profile.linkedin_url,
    website: payload.profile.website,
  };

  // Compile tailored ATS PDF
  const pdfBuffer = await compileAtsResumePdf(payload.tailoredCvText, contact);

  if (target.provider === "greenhouse" && target.submitUrl) {
    return await submitGreenhouse(target, payload, pdfBuffer);
  }

  if (target.provider === "lever" && target.submitUrl) {
    return await submitLever(target, payload, pdfBuffer);
  }

  // Portals needing DOM injection (Ashby, Workday, custom)
  return {
    ok: false,
    provider: target.provider,
    method: "browser_autofill",
    directSubmitSupported: false,
    receipt: undefined,
    error: `${target.provider.toUpperCase()} requires active browser session for submission. Use 1-Click Autofill extension.`,
  };
}
