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

/** "Good morning", "Good afternoon" or "Good evening" in Indian time. */
export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The first name for the greeting: from the profile name, else the part of the email before any dot or number. */
export function firstName(name: string | null | undefined, email: string | null | undefined): string {
  const fromName = (name ?? "").trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = (email ?? "").split("@")[0].split(/[._\d]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}
