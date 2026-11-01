import { DEVICE_MAX_AGE, now } from "./http.ts";

/**
 * Hourly cleanup (design doc 6.5). Reads already ignore expired rows, so this
 * only keeps the tables small.
 */
export async function cleanup(db: D1Database): Promise<void> {
  const time = now();
  await db.batch([
    db.prepare("DELETE FROM pastes WHERE expires_at IS NOT NULL AND expires_at <= ?").bind(time),
    db.prepare("DELETE FROM pair_codes WHERE expires_at <= ? OR used_at IS NOT NULL").bind(time),
    // A device's cookie was last renewed at last_seen_at, so after a year
    // (plus a day of slack) it has expired in the browser too.
    db.prepare("DELETE FROM devices WHERE last_seen_at < ?").bind(time - DEVICE_MAX_AGE - 86400),
  ]);
}
