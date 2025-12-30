import type { TaskTemplate, Recurrence, TaskOccurrence, UUID } from "./types";

export function uuid(): UUID {
  // Reasonable for local vault IDs
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYMD(s: string): Date {
  const parts = s.split("-").map((x) => Number(x));
  const y = Number.isFinite(parts[0]) ? (parts[0] as number) : 1970;
  const m = Number.isFinite(parts[1]) ? (parts[1] as number) : 1;
  const dd = Number.isFinite(parts[2]) ? (parts[2] as number) : 1;
  return new Date(y, m - 1, dd);
}


/**
 * Weekday mapping: 1..7 = Mon..Sun
 * JS getDay(): 0..6 = Sun..Sat
 */
export function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

export function isoDayToJs(iso: number): number {
  return iso === 7 ? 0 : iso;
}

/** Start of week (Mon) for the date */
export function startOfIsoWeek(d: Date): Date {
  const js = d.getDay();
  const iso = jsDayToIso(js);
  const delta = iso - 1;
  const out = new Date(d);
  out.setDate(d.getDate() - delta);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** End of week (Sun) for the date */
export function endOfIsoWeek(d: Date): Date {
  const start = startOfIsoWeek(d);
  const out = new Date(start);
  out.setDate(start.getDate() + 6);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * ISO week key in form YYYY-Www (Mon-based)
 * This is close to ISO week but implemented deterministically for grouping.
 */
export function weekKey(d: Date): string {
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  const thursday = new Date(target);
  thursday.setDate(target.getDate() + (4 - jsDayToIso(target.getDay())));
  const year = thursday.getFullYear();

  // Week 1 is the week with Jan 4th
  const jan4 = new Date(year, 0, 4);
  const week1Start = startOfIsoWeek(jan4);
  const diffDays = Math.floor((startOfIsoWeek(target).getTime() - week1Start.getTime()) / 86400000);
  const wk = Math.floor(diffDays / 7) + 1;
  return `${year}-W${pad2(wk)}`;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function clampDayOfMonth(year: number, month0: number, day: number): number {
  const max = daysInMonth(year, month0);
  return Math.max(1, Math.min(day, max));
}

export function isTaskDueOnDate(task: TaskTemplate, date: Date): boolean {
  const rec = task.recurrence;
  const isoDow = jsDayToIso(date.getDay());

  if (rec.type === "daily") return true;

  if (rec.type === "weekly") {
    return rec.weekdays.includes(isoDow);
  }

  if (rec.type === "monthly") {
    const y = date.getFullYear();
    const m0 = date.getMonth();
    const dom = date.getDate();

    if (rec.mode === "anytime") {
      // Appear every day of the month, but only needs 1 completion.
      // For your UI expectation (% due occurrences), "anytime" should be treated as "due once"
      // We handle this by *not* returning true for every day; instead we show a single monthly due item.
      // Therefore, we return true only on the 1st of the month as the "anchor day."
      return dom === 1;
    }

    if (rec.mode === "dayOfMonth") {
      return dom === clampDayOfMonth(y, m0, rec.day);
    }

    if (rec.mode === "nthWeekday") {
      const targetIsoDow = rec.weekday;
      if (isoDow !== targetIsoDow) return false;

      // Find nth weekday occurrence in the month
      const first = new Date(y, m0, 1);
      const firstIso = jsDayToIso(first.getDay());
      const offset = (targetIsoDow - firstIso + 7) % 7;
      const firstTargetDom = 1 + offset;
      const nthDom = firstTargetDom + (rec.nth - 1) * 7;

      const max = daysInMonth(y, m0);
      if (nthDom > max) return false;
      return dom === nthDom;
    }
  }

  return false;
}

/**
 * For a window, enumerate all dates (YYYY-MM-DD) inclusive.
 */
export function enumerateDates(mode: "day" | "week" | "month", anchor: Date): Date[] {
  const a = new Date(anchor);
  a.setHours(0, 0, 0, 0);

  if (mode === "day") return [a];

  if (mode === "week") {
    const start = startOfIsoWeek(a);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  // month
  const y = a.getFullYear();
  const m0 = a.getMonth();
  const count = daysInMonth(y, m0);
  return Array.from({ length: count }, (_, i) => new Date(y, m0, i + 1));
}

export function displayDow(iso: number): string {
  return ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][iso] ?? "";
}

export function summarizeRecurrence(rec: Recurrence): string {
  if (rec.type === "daily") return "Daily";
  if (rec.type === "weekly") return `Weekly: ${rec.weekdays.map(displayDow).join(", ")}`;
  if (rec.type === "monthly") {
    if (rec.mode === "anytime") return "Monthly: once anytime";
    if (rec.mode === "dayOfMonth") return `Monthly: day ${rec.day}`;
    return `Monthly: ${rec.nth}x ${displayDow(rec.weekday)}`;
  }
  return "Custom";
}

export function occurrenceLabel(occ: TaskOccurrence): string {
  return occ.overrideTitle ?? occ.titleSnapshot;
}
