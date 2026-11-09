import { PageHeader, Card } from "@/components/ui";

const PARTNERS = [
  { name: "micro1", url: "https://www.micro1.ai", text: "An AI-vetted talent network that places experts on contract projects, including work for AI labs that need domain expertise." },
  { name: "Turing", url: "https://www.turing.com", text: "Matches vetted professionals with AI training and remote contract work. Screening includes skill assessments." },
  { name: "Mercor", url: "https://www.mercor.com", text: "Expert contract work for AI labs. Professionals with sales and business backgrounds can apply for domain-expert projects." },
];

export default function SideIncomePage() {
  return (
    <section className="py-6">
      <PageHeader eyebrow="Side income · Remote Work Syndicate" title="Earn on the side with your GTM expertise">
        AI labs pay sales and domain experts for contract work, like writing and reviewing sales scenarios for AI training. Each partner sets its own rates, eligibility and screening. Joining takes you to the partner&apos;s own site.
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PARTNERS.map((p) => (
          <Card key={p.name} className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="text-sm">{p.text}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"><dt className="text-muted">Rate</dt><dd>Set by the partner. Check before you join.</dd><dt className="text-muted">Eligibility</dt><dd>Varies by country and project</dd></dl>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-auto rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-ink">Join on {p.name}&apos;s site ↗</a>
            <p className="border-t border-line pt-2 text-xs text-muted">May become a referral link. Remote Work Syndicate may earn a fee if you&apos;re accepted. Backchannel doesn&apos;t hire you or pay you.</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
