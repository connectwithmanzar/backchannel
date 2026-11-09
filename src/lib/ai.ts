import OpenAI from "openai";

// Provider choice, first key found wins:
//   GROQ_API_KEY       → Groq (free tier, no inference data kept by default), open model gpt-oss-120b
//   OPENROUTER_API_KEY → OpenRouter (model "anthropic/claude-haiku-4-5")
//   ANTHROPIC_API_KEY  → Anthropic's OpenAI-compatible endpoint (model "claude-haiku-4-5")
// Free Gemini is deliberately not an option: Google's terms say free-tier content is used to improve
// their products and may be read by people, and CVs and emails are personal information.
export type AiProvider = { name: "groq" | "openrouter" | "anthropic" | "none"; baseURL: string; apiKey: string; model: string; smartModel: string };

const hasKey = (v: string | undefined) => (v ?? "").length > 10;

export function pickProvider(env: Record<string, string | undefined>): AiProvider {
  if (hasKey(env.GROQ_API_KEY)) {
    const model = env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    return { name: "groq", baseURL: "https://api.groq.com/openai/v1", apiKey: env.GROQ_API_KEY!, model, smartModel: env.AI_MODEL_SMART ?? model };
  }
  if (hasKey(env.OPENROUTER_API_KEY)) {
    return { name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey: env.OPENROUTER_API_KEY!, model: "anthropic/claude-haiku-4-5", smartModel: env.AI_MODEL_SMART ?? "anthropic/claude-sonnet-4-5" };
  }
  if (hasKey(env.ANTHROPIC_API_KEY)) {
    return { name: "anthropic", baseURL: "https://api.anthropic.com/v1/", apiKey: env.ANTHROPIC_API_KEY!, model: "claude-haiku-4-5", smartModel: env.AI_MODEL_SMART ?? "claude-sonnet-4-5" };
  }
  return { name: "none", baseURL: "https://api.anthropic.com/v1/", apiKey: "", model: "claude-haiku-4-5", smartModel: "claude-haiku-4-5" };
}

const provider = pickProvider(process.env);
export const AI_MODEL = provider.model;
export const AI_MODEL_SMART = provider.smartModel;

// gpt-oss "thinks" before answering and the thinking counts toward the token limit. Ask for little thinking
// and leave headroom, so short answers (like a 2-sentence explanation) are not cut off to nothing.
export const GROQ_THINKING_HEADROOM = 800;
export function adaptGroqBody(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  if (typeof next.model === "string" && next.model.includes("gpt-oss")) next.reasoning_effort = "low";
  if (typeof next.max_tokens === "number") {
    next.max_completion_tokens = next.max_tokens + GROQ_THINKING_HEADROOM;
    delete next.max_tokens;
  }
  return next;
}

const groqFetch: typeof fetch = async (input, init) => {
  if (typeof init?.body === "string") {
    try { init = { ...init, body: JSON.stringify(adaptGroqBody(JSON.parse(init.body))) }; } catch { /* send as is */ }
  }
  return fetch(input, init);
};

export function createAIClient(): OpenAI {
  if (provider.name === "groq") return new OpenAI({ baseURL: provider.baseURL, apiKey: provider.apiKey, fetch: groqFetch });
  if (provider.name === "openrouter") {
    return new OpenAI({
      baseURL: provider.baseURL, apiKey: provider.apiKey,
      defaultHeaders: { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://backchannel-eight.vercel.app", "X-Title": "Backchannel" },
    });
  }
  return new OpenAI({ baseURL: provider.baseURL, apiKey: provider.apiKey });
}

export function hasAIKey(): boolean {
  return provider.name !== "none";
}

export const NO_AI_MESSAGE = "AI isn't set up yet. Add GROQ_API_KEY (free), OPENROUTER_API_KEY or ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.";

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
