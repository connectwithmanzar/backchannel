import OpenAI from "openai";

// Works with either key:
//   OPENROUTER_API_KEY → OpenRouter (model "anthropic/claude-haiku-4-5")
//   ANTHROPIC_API_KEY  → Anthropic's OpenAI-compatible endpoint (model "claude-haiku-4-5")
const isOpenRouter = () => (process.env.OPENROUTER_API_KEY ?? "").length > 10;

export const AI_MODEL = (process.env.OPENROUTER_API_KEY ?? "").length > 10 ? "anthropic/claude-haiku-4-5" : "claude-haiku-4-5";
export const AI_MODEL_SMART =
  process.env.AI_MODEL_SMART ?? ((process.env.OPENROUTER_API_KEY ?? "").length > 10 ? "anthropic/claude-sonnet-4-5" : "claude-sonnet-4-5");

export function createAIClient(): OpenAI {
  if (isOpenRouter()) {
    return new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://backchannel-eight.vercel.app", "X-Title": "Backchannel" },
    });
  }
  return new OpenAI({ baseURL: "https://api.anthropic.com/v1/", apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
}

export function hasAIKey(): boolean {
  return isOpenRouter() || (process.env.ANTHROPIC_API_KEY ?? "").length > 10;
}

export const NO_AI_MESSAGE = "AI isn't set up yet. Add OPENROUTER_API_KEY or ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.";

/** One-shot text completion. */
export async function aiText(system: string, user: string, opts: { maxTokens?: number; smart?: boolean } = {}): Promise<string> {
  const res = await createAIClient().chat.completions.create({
    model: opts.smart ? AI_MODEL_SMART : AI_MODEL,
    max_tokens: opts.maxTokens ?? 800,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return (res.choices[0]?.message?.content ?? "").trim();
}

/** Completion that must return JSON; tolerates ```json fences and surrounding text. */
export async function aiJson<T>(system: string, user: string, opts: { maxTokens?: number; smart?: boolean } = {}): Promise<T> {
  const raw = await aiText(system + "\nReturn only valid JSON. No markdown, no commentary.", user, opts);
  return parseJsonLoose<T>(raw);
}

export function parseJsonLoose<T>(raw: string): T {
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(unfenced) as T; } catch { /* fall through */ }
  const start = unfenced.search(/[[{]/);
  const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
  if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1)) as T;
  throw new Error("The AI reply wasn't valid JSON. Please try again.");
}
