import WatchButton from "./WatchButton";

type Award = { name: string; year?: number; source_url?: string };

export type CompanyData = {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  hq: string | null;
  sector: string | null;
  why_great: string | null;
  criteria_tags: string[];
  awards: Award[];
  visa_note: string | null;
  watching: boolean;
  open_jobs: number;
};

export default function CompanyCard({ company }: { company: CompanyData }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold">{company.name}</h2>
            {company.sector && (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                {company.sector}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {company.hq ?? company.country ?? ""}
            {company.open_jobs > 0 && (
              <> · <span className="text-signal font-semibold">{company.open_jobs} open role{company.open_jobs > 1 ? "s" : ""}</span></>
            )}
            {company.open_jobs === 0 && (
              <> · <span className="text-muted italic">No open sales role right now</span></>
            )}
          </p>
        </div>
        <WatchButton companyId={company.id} initialWatching={company.watching} />
      </div>

      {/* Why great */}
      {company.why_great && (
        <p className="text-sm leading-relaxed">{company.why_great}</p>
      )}

      {/* Criteria tags */}
      {company.criteria_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {company.criteria_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-fg"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Awards */}
      {company.awards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {company.awards.map((a, i) => (
            <span key={i} className="text-xs text-muted">
              {a.source_url ? (
                <a
                  href={a.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-fg"
                >
                  🏆 {a.name}{a.year ? ` ${a.year}` : ""}
                </a>
              ) : (
                <>🏆 {a.name}{a.year ? ` ${a.year}` : ""}</>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Visa note */}
      {company.visa_note && (
        <p className="text-xs text-muted italic">{company.visa_note}</p>
      )}
    </div>
  );
}
