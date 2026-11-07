import OpenAI from "openai";

export const AI_MODEL = "anthropic/claude-haiku-4-5";

export function createAIClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    defaultHeaders: {
      "HTTP-Referer": "https://backchannel-eight.vercel.app",
      "X-Title": "Backchannel",
    },
  });
}

export function hasAIKey(): boolean {
  const key = process.env.OPENROUTER_API_KEY ?? "";
  return key.length > 10;
}
