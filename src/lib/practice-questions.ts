// Questions for interview practice. Salary, notice period, visa and work-authorisation questions are left out on purpose:
// Backchannel never answers those for you, so rehearse them out loud yourself.

export type PracticeQuestion = { id: string; group: "Sales" | "GTM" | "About you"; text: string };

export const PRACTICE_QUESTIONS: PracticeQuestion[] = [
  { id: "cold-open", group: "Sales", text: "You have a prospect on the phone for 20 seconds. Give me your opening." },
  { id: "discovery", group: "Sales", text: "Run a discovery call: what are your first three questions, and why?" },
  { id: "price", group: "Sales", text: "A prospect says you are too expensive. What do you say?" },
  { id: "qualify", group: "Sales", text: "How do you decide whether a deal is worth pursuing?" },
  { id: "forecast", group: "Sales", text: "How do you keep your pipeline honest in the CRM?" },
  { id: "workflow", group: "GTM", text: "Walk me through a workflow or process you built and what it changed." },
  { id: "metrics", group: "GTM", text: "How do you measure whether outbound is working?" },
  { id: "ai", group: "GTM", text: "How would you use AI in prospecting without sounding robotic?" },
  { id: "moving", group: "About you", text: "Why are you looking to move?" },
  { id: "gap", group: "About you", text: "Tell me about the gap in your CV." },
  { id: "ramp", group: "About you", text: "How fast could you ramp up in this role, and how?" },
  { id: "feedback", group: "About you", text: "Tell me about a time you took feedback and changed how you worked." },
  { id: "numbers", group: "About you", text: "Walk me through your numbers. What were they measured against?" },
];

export const questionById = (id: string): PracticeQuestion | undefined => PRACTICE_QUESTIONS.find((q) => q.id === id);
