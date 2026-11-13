/** The plain-word label shown beside a match percentage. */
export function matchLabel(score: number): string {
  if (score >= 80) return "Best match";
  if (score >= 65) return "Strong match";
  if (score >= 50) return "Worth applying";
  return "Stretch";
}
