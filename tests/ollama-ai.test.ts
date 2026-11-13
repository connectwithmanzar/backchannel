import test from "node:test";
import assert from "node:assert/strict";
import { pickProvider } from "../src/lib/ai";

test("pickProvider selects ollama when USE_OLLAMA is true", () => {
  const p = pickProvider({ USE_OLLAMA: "true" });
  assert.equal(p.name, "ollama");
  assert.equal(p.baseURL, "http://localhost:11434/v1");
  assert.equal(p.model, "qwen2.5:14b");
  assert.equal(p.apiKey, "ollama");
});

test("pickProvider honors custom OLLAMA_MODEL and OLLAMA_BASE_URL", () => {
  const p = pickProvider({ OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1/", OLLAMA_MODEL: "llama3.3:70b" });
  assert.equal(p.name, "ollama");
  assert.equal(p.baseURL, "http://127.0.0.1:11434/v1");
  assert.equal(p.model, "llama3.3:70b");
});
