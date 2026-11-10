import { parseDescription } from "@/lib/description";

/** A job posting laid out as headings, short paragraphs and bullet lists. */
export default function Description({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseDescription(text);
  if (!blocks.length) return null;
  return (
    <div className={`flex flex-col gap-3 text-sm leading-relaxed ${className}`}>
      {blocks.map((b, i) => b.type === "heading"
        ? <h3 key={i} className="mt-2 font-display text-base font-semibold">{b.text}</h3>
        : b.type === "list"
          ? <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          : <p key={i} className="text-fg/90">{b.text}</p>)}
    </div>
  );
}
