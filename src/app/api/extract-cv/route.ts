import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { createAIClient, hasAIKey, AI_MODEL, NO_AI_MESSAGE, parseJsonLoose } from "@/lib/ai";

// unpdf is built for serverless; pdf-parse needs browser APIs (DOMMatrix) that Vercel doesn't have.
async function pdfToText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

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
      { error: NO_AI_MESSAGE },
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
      cvText = await pdfToText(buffer);
    } else {
      cvText = buffer.toString("utf-8");
    }

    if (!cvText.trim()) {
      return NextResponse.json({ error: "Could not read text from file" }, { status: 400 });
    }
  } catch (err) {
    console.error("extract-cv: reading file failed:", err);
    return NextResponse.json({ error: "Couldn't read that PDF. Try a .txt or Word-exported text file instead." }, { status: 400 });
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
    const extracted = parseJsonLoose<Record<string, unknown>>(raw);

    return NextResponse.json({ extracted, cvText });
  } catch (err) {
    return NextResponse.json(
      { error: `AI extraction failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
