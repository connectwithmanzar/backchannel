export type Block = { type: "heading"; text: string } | { type: "paragraph"; text: string } | { type: "list"; items: string[] };

const SECTIONS = [
  "about the role", "about the job", "about the team", "about us", "about you", "about the company", "overview", "job description", "role summary", "the role", "summary",
  "what you'll do", "what you’ll do", "what you will do", "what you'll be doing", "responsibilities", "key responsibilities", "your responsibilities", "the opportunity",
  "requirements", "key requirements", "qualifications", "minimum qualifications", "preferred qualifications", "who you are", "what we're looking for", "what we’re looking for", "what we look for", "what you bring", "skills", "experience",
  "nice to have", "bonus points", "what we offer", "what you'll get", "benefits", "perks", "compensation", "salary", "why join us", "why you'll love working here", "how to apply",
];
const SECTION_RE = new RegExp(`^(?:${SECTIONS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*:?$`, "i");
const SECTION_LEAD_RE = new RegExp(`^(${SECTIONS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*:\\s+(.{10,})$`, "i");
const BULLET_RE = /^\s*(?:[-•·▪●◦*]|\d{1,2}[.)])\s+/;

const isHeading = (line: string) => {
  const t = line.trim().replace(/[*#]+/g, "").trim();
  if (!t || t.length > 70) return false;
  if (SECTION_RE.test(t)) return true;
  return /^[A-Z0-9][A-Z0-9 &/'’,-]{3,}:?$/.test(t) && t === t.toUpperCase() && /[A-Z]{3}/.test(t);
};

/** A description that arrived as one long line gets breaks at section names, bullets and every few sentences. */
function openUp(text: string): string {
  const alt = SECTIONS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  let t = text.replace(new RegExp(`\\s+(?=(?:${alt})\\s*:)`, "gi"), "\n\n");
  t = t.replace(new RegExp(`(?<=[.!?])\\s+(?=(?:${alt})\\b)`, "gi"), "\n\n");
  t = t.replace(/\s*[•▪●◦]\s*/g, "\n• ");
  t = t.replace(/(?<=[.!?:])\s+-\s+(?=[A-Z])/g, "\n- ");
  // Long plain runs: a new paragraph after every third sentence.
  return t.split("\n").map((line) => {
    if (line.length < 420 || BULLET_RE.test(line)) return line;
    const sentences = line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    const out: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) out.push(sentences.slice(i, i + 3).join(" "));
    return out.join("\n\n");
  }).join("\n");
}

/** Turns posting text into headings, paragraphs and bullet lists, so it can be read instead of scanned. */
export function parseDescription(raw: string): Block[] {
  let text = String(raw ?? "").replace(/\r/g, "").replace(/[ \t ]+/g, " ").trim();
  if (!text) return [];
  if ((text.match(/\n/g) ?? []).length < 3 && text.length > 300) text = openUp(text);
  const blocks: Block[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, "").trim();
      const last = blocks[blocks.length - 1];
      if (last?.type === "list") last.items.push(item); else blocks.push({ type: "list", items: [item] });
    } else if (SECTION_LEAD_RE.test(line)) {
      const m = line.match(SECTION_LEAD_RE)!;
      blocks.push({ type: "heading", text: m[1].trim() });
      blocks.push({ type: "paragraph", text: m[2].trim() });
    } else if (isHeading(line)) {
      blocks.push({ type: "heading", text: line.replace(/[*#]+/g, "").replace(/:$/, "").trim() });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }
  return blocks;
}
