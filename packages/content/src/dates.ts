/** Offset applied when a date has no timezone (Asia/Shanghai). */
export const DEFAULT_OFFSET = "+08:00";

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse a frontmatter date into an ISO 8601 string with an explicit offset.
 * Accepts YYYY-MM-DD, YYYY-MM-DD HH:mm, YYYY-MM-DD HH:mm:ss and ISO 8601.
 * Returns null when the value cannot be parsed.
 */
export function parseFrontmatterDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string") return null;
  const text = value.trim();

  const local = LOCAL_DATE.exec(text);
  if (local) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = local;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${DEFAULT_OFFSET}`;
    if (!isRealDate(iso, Number(year), Number(month), Number(day))) return null;
    return iso;
  }

  if (ISO_WITH_OFFSET.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : text;
  }
  return null;
}

function isRealDate(iso: string, year: number, month: number, day: number): boolean {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  // Reject overflow such as 2026-02-31 by checking the calendar date in UTC+8.
  const shifted = new Date(parsed.getTime() + 8 * 3600 * 1000);
  return (
    shifted.getUTCFullYear() === year &&
    shifted.getUTCMonth() + 1 === month &&
    shifted.getUTCDate() === day
  );
}

/** Format "now" as frontmatter date text in UTC+8, e.g. "2026-11-01 14:05". */
export function formatNowForFrontmatter(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}
