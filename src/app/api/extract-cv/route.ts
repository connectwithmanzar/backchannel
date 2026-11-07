import { NextRequest, NextResponse } from "next/server";
import * as pdfParseModule from "pdf-parse";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { createAIClient, hasAIKey, AI_MODEL } from "@/lib/ai";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = (pdfParseModule as any).default ?? pdfParseModule;

export const runtime = "nodejs";

const SYSTEM = `You are a CV parser for a sales job-search tool. Extract facts ONLY from the CV text — never invent or guess. Return a JSON object with these exact keys:
- current_role: string | null  (most recent job title)
- years: number | null  (total years of sales experience)
- quota_attainment_pct: number | null  (most recent or best quota attainment as a percentage, e.g. 112)
- meetings_per_month: number | null  (average meetings or demos booked per month)
- segment: "SMB" | "Mid-market" | "Enterprise" | null
- motion: "Outbound" | "Inbound" | "Full-cycle" | null
- tools: string[]  (CRM, sales engagement, prospecting tools — empty array if none found)
- achievements: string[]  (up to 5 bullet points, verbatim from the CV, that show results with numbers)
Return only valid JSON, no markdown, no commentary.`;

export async function POST(request: NextRequest) {
  // Auth required — prevents unauthenticated users from burning AI quota
  const uc = await createClient();
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 10 CV extractions per hour per user
  if (!rateLimit(`extract-cv:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in " + retryAfter(`extract-cv:${user.id}`) + "s." },
      { status: 429 }
    );
  }

  if (!hasAIKey()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured." },
      { status: 503 }
    );
  }

  let cvText: string;

  try {
    const formData = await request.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const parsed = await pdfParse(buffer);
      cvText = parsed.text;
    } else {
      cvText = buffer.toString("utf-8");
    }

    if (!cvText.trim()) {
      return NextResponse.json({ error: "Could not read text from file" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 400 });
  }

  try {
    const client = createAIClient();
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Extract from this CV:\n\n${cvText.slice(0, 12000)}` },
      ],
    });

    const raw = (response.choices[0].message.content ?? "").trim();
    const json = raw.startsWith("{") ? raw : raw.replace(/^```json\s*/i, "").replace(/```$/, "");
    const extracted = JSON.parse(json);

    return NextResponse.json({ extracted, cvText });
  } catch (err) {
    return NextResponse.json(
      { error: `AI extraction failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
