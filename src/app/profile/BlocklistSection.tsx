"use client";
import { useState } from "react";
import type { BlocklistEntry } from "./ProfileClient";

const TYPES = ["domain", "company", "person"] as const;
type BlockType = typeof TYPES[number];

export default function BlocklistSection({
  blocklist,
  onChange,
}: {
  blocklist: BlocklistEntry[];
  onChange: (list: BlocklistEntry[]) => void;
}) {
  const [blockType, setBlockType] = useState<BlockType>("domain");
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const v = value.trim();
    if (!v) return;
    setAdding(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "blocklist_add", blockType, value: v }),
    });
    if (res.ok) {
      const tempEntry: BlocklistEntry = { id: crypto.randomUUID(), type: blockType, value: v };
      onChange([tempEntry, ...blocklist]);
      setValue("");
    }
    setAdding(false);
  }

  async function handleRemove(id: string) {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "blocklist_remove", id }),
    });
    onChange(blocklist.filter((e) => e.id !== id));
  }

  const placeholder = {
    domain: "e.g. currentemployer.com",
    company: "e.g. Acme Corp",
    person: "e.g. Jane Smith",
  }[blockType];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold">Stealth blocklist</p>
        <p className="mt-1 text-xs text-muted">
          No roles, emails or referral requests will be shown or sent for anything on this list. Add your current employer here.
        </p>
      </div>

      {/* Add form */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBlockType(t)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                blockType === t
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-sunk text-muted hover:border-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-line bg-sunk px-3 py-2 text-sm outline-none focus:border-accent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !value.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
          >
            Block
          </button>
        </div>
      </div>

      {/* Blocklist entries */}
      {blocklist.length === 0 ? (
        <p className="text-sm text-muted">Nothing blocked yet.</p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {blocklist.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <span className="mr-2 rounded-full border border-line px-2 py-0.5 text-xs capitalize text-muted">
                  {entry.type}
                </span>
                <span className="text-sm font-medium">{entry.value}</span>
              </div>
              <button
                onClick={() => handleRemove(entry.id)}
                className="text-xs text-muted hover:text-warn"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
