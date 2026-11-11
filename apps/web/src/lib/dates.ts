/** Dates are reasoned about in Cairo time, where every fridge is. */
export const TIME_ZONE = "Africa/Cairo";
/** Egypt's weekend: Friday and Saturday (0 = Sunday). */
export const WEEKEND_DAYS = [5, 6] as const;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hour12: false });

/** yyyy-mm-dd of `date` in Cairo. */
export function cairoDay(date: Date = new Date()): string {
  return dayFormatter.format(date);
}

export function cairoHour(date: Date = new Date()): number {
  return Number(hourFormatter.format(date)) % 24;
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Start of the Cairo day containing `date`, as an absolute instant. */
export function startOfCairoDay(date: Date = new Date()): Date {
  const day = cairoDay(date);
  // Cairo is UTC+2 or UTC+3 (summer time); find the offset at noon of that day.
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const cairoNoonHour = cairoHour(noonUtc);
  const offsetHours = cairoNoonHour - 12;
  return new Date(Date.parse(`${day}T00:00:00Z`) - offsetHours * 3_600_000);
}

export function greeting(date: Date = new Date()): string {
  const h = cairoHour(date);
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function shortTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-EG", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

export function relativeTime(date: Date | string, now = Date.now()): string {
  const diff = Math.round((now - new Date(date).getTime()) / 1000);
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.round(diff / 3600)} h ago`;
  return new Date(date).toLocaleDateString("en-EG", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
}
