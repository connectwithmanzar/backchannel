"use client";
import { useState } from "react";
import { Card, Pill, btn, btnPrimary, input } from "@/components/ui";
import { copyText } from "@/lib/api";

export default function NegotiationStrategist() {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [currentBase, setCurrentBase] = useState("");
  const [currentVariable, setCurrentVariable] = useState("");
  const [targetBase, setTargetBase] = useState("");
  const [targetBonus, setTargetBonus] = useState("");
  const [leverage, setLeverage] = useState("other_interviews");
  const [generated, setGenerated] = useState<{
    emailScript: string;
    phoneScript: string;
    fallbackTactic: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function handleGenerate() {
    const co = company.trim() || "the hiring team";
    const r = role.trim() || "this position";
    const base = currentBase ? `$${Number(currentBase).toLocaleString()}` : "the current base offer";
    const target = targetBase ? `$${Number(targetBase).toLocaleString()}` : "a higher base";
    const bonus = targetBonus ? `$${Number(targetBonus).toLocaleString()}` : "$10,000 - $15,000";

    const leverageReason =
      leverage === "other_interviews"
        ? "I am currently in late-stage final rounds with another enterprise team, but your mission and product at " + co + " remain my absolute first choice."
        : leverage === "metrics"
        ? "Given my track record of delivering $2M+ in qualified pipeline and driving 60% operational efficiency through automation, I am confident in ramping ahead of quota."
        : "Based on current market benchmarks for high-velocity enterprise outbound in this segment, similar roles are landing in this tier.";

    const emailScript = `Subject: Reflecting on the ${r} offer / Follow-up - Manzar Imam

Hi Team,

Thank you so much for extending the offer for the ${r} role at ${co}. I've really enjoyed our conversations and am genuinely excited about what you are building.

${leverageReason}

After reviewing the total compensation details, I would be thrilled to sign immediately if we can align on a base salary of ${target} (or bridge the difference with a ${bonus} signing bonus).

I know compensation structures have parameters, and I want to ensure this is a win-win partnership. I am eager to hit the ground running and drive pipeline for ${co}.

Best regards,
Manzar Imam`;

    const phoneScript = `1. The Thank You & Excitement:
"First, thank you for putting this together. I really enjoyed meeting the team, and ${co} is definitely my top choice."

2. The Anchor & Request:
"I reviewed the numbers: the variable structure looks great, but to feel completely settled and sign today, I'm hoping we can get the base closer to ${target}."

3. The Silence & Pause:
(State your number and STOP TALKING. Let the recruiter respond first.)

4. The Bridge Pivot (if they say base is strictly locked):
"I understand base bands can be rigid. If base is fixed at ${base}, could we explore a ${bonus} sign-on bonus, or formalize an accelerated 6-month performance review to bridge the gap?"`;

    const fallbackTactic = `• If Base Is Capped: Ask for a one-time signing bonus or relocation/remote setup stipend (${bonus}).
• If Equity/Variable Is Offered Instead: Negotiate a non-recoverable draw for the first 3-4 months during ramp.
• If Budget Is Locked: Ask for an explicit clause in the contract for a 6-month milestone compensation review based on hitting 100% of ramp quota.`;

    setGenerated({ emailScript, phoneScript, fallbackTactic });
  }

  async function handleCopy(key: string, text: string) {
    if (await copyText(text)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  }

  return (
    <Card className="flex flex-col gap-4 border-accent/40 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-fg">🤝 Offer Negotiation &amp; Counter-Offer Strategist</h2>
            <Pill tone="good">Salary Leverage</Pill>
          </div>
          <p className="mt-1 text-sm text-muted">
            Turn your current offer into a 10–20% higher package with data-backed counter-offer scripts and phone talking tracks.
          </p>
        </div>
        <button
          type="button"
          className={open ? btn : btnPrimary}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide Strategist" : "Open Strategist ↗"}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-5 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Company
              <input
                className={`${input} text-fg`}
                placeholder="e.g. Acme SaaS"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Role Title
              <input
                className={`${input} text-fg`}
                placeholder="e.g. Senior GTM Associate"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Your Primary Leverage Point
              <select
                className={`${input} text-fg`}
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
              >
                <option value="other_interviews">Multiple active final rounds</option>
                <option value="metrics">Proven $2M+ pipeline track record</option>
                <option value="market_rates">Market rate benchmark parity</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Offered Base Salary ($)
              <input
                type="number"
                className={`${input} text-fg`}
                placeholder="e.g. 75000"
                value={currentBase}
                onChange={(e) => setCurrentBase(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Target Base Salary ($)
              <input
                type="number"
                className={`${input} text-fg`}
                placeholder="e.g. 90000"
                value={targetBase}
                onChange={(e) => setTargetBase(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Target Sign-On Bonus ($)
              <input
                type="number"
                className={`${input} text-fg`}
                placeholder="e.g. 10000"
                value={targetBonus}
                onChange={(e) => setTargetBonus(e.target.value)}
              />
            </label>
          </div>

          <div>
            <button
              type="button"
              className={btnPrimary}
              onClick={handleGenerate}
            >
              ⚡ Generate Counter-Offer Strategy
            </button>
          </div>

          {generated && (
            <div className="flex flex-col gap-4 border-t border-line pt-4">
              {/* Email Draft */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-fg">📧 Written Counter-Offer Email</h3>
                  <button
                    type="button"
                    className="text-xs font-semibold text-accent hover:underline"
                    onClick={() => handleCopy("email", generated.emailScript)}
                  >
                    {copiedKey === "email" ? "Copied ✓" : "Copy email"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg">
                  {generated.emailScript}
                </pre>
              </div>

              {/* Phone Talking Track */}
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-fg">📞 Live Phone Call Talking Track</h3>
                  <button
                    type="button"
                    className="text-xs font-semibold text-accent hover:underline"
                    onClick={() => handleCopy("phone", generated.phoneScript)}
                  >
                    {copiedKey === "phone" ? "Copied ✓" : "Copy talking track"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted">
                  {generated.phoneScript}
                </pre>
              </div>

              {/* Fallback Tacts */}
              <div className="rounded-xl border border-line bg-sunk/40 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Fallback Levers (If Base Is Locked)</h3>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg">
                  {generated.fallbackTactic}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
