// Shared by client and server (no server-only imports here).
export const SENSITIVE_LABELS: Record<string, string> = {
  visa_sponsorship: "Will you need visa sponsorship?",
  work_authorisation: "Which countries are you authorised to work in?",
  salary_expectation: "What are your salary / OTE expectations?",
  notice_period: "What is your notice period?",
  current_location: "Where are you based now?",
  willing_to_relocate: "Are you willing to relocate?",
  diversity: "Diversity questions (e.g. 'Prefer not to say')",
};
