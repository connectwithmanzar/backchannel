/** "1 email", "3 emails": always the right plural, never "email(s)". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A short date that cannot be misread as month-first or day-first: "9 Nov, 12:12 pm IST". */
export function shortDateTime(iso: string, timeZone = "Asia/Kolkata", zoneLabel = "IST"): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone, day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time} ${zoneLabel}`;
}
