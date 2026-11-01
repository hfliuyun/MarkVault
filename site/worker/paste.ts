/** Paste items (design doc 6.1, 6.4). */
import type { Device } from "./devices.ts";
import { HttpError, cleanText, json, now, randomId, readJson } from "./http.ts";

/** Single paste limit: 1MB of UTF-8 (a D1 row can hold 2MB). */
const MAX_CONTENT_BYTES = 1024 * 1024;
/**
 * The list includes full content for one-tap copy, but only for items up to
 * this many characters. Bigger ones are fetched when copied, so a full page
 * stays under ~1M characters (the free plan allows 10ms CPU per request).
 */
const LIST_INLINE_CHARS = 50_000;
const LIST_MAX = 20;
const EXPIRY: Record<string, number | null> = { "1h": 3600, "1d": 86400, "1w": 7 * 86400, never: null };
const LANGUAGE = /^[a-z0-9+#.-]{1,20}$/;

interface PasteRow {
  id: string;
  title: string;
  language: string;
  created_at: number;
  expires_at: number | null;
  size: number;
  content: string | null;
  device_name?: string | null;
}

/** GET /api/paste/items?limit=20&before=<cursor> */
export async function listPastes(request: Request, db: D1Database): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "20", 10) || LIST_MAX, 1), LIST_MAX);
  const time = now();

  // Cursor "<created_at>:<id>" keeps paging stable when several items share a second.
  let where = "(p.expires_at IS NULL OR p.expires_at > ?)";
  const binds: (string | number)[] = [LIST_INLINE_CHARS, time];
  const cursor = /^(\d+):([a-z0-9]{8})$/.exec(params.get("before") ?? "");
  if (cursor) {
    where += " AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))";
    binds.push(Number(cursor[1]), Number(cursor[1]), cursor[2]);
  }
  binds.push(limit + 1);

  const { results } = await db
    .prepare(
      `SELECT p.id, p.title, p.language, p.created_at, p.expires_at, length(p.content) AS size,
              CASE WHEN length(p.content) <= ? THEN p.content END AS content,
              d.name AS device_name
       FROM pastes p LEFT JOIN devices d ON d.id = p.device_id
       WHERE ${where}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all<PasteRow>();

  const more = results.length > limit;
  const items = more ? results.slice(0, limit) : results;
  const last = items.at(-1);
  return json({ items, next_cursor: more && last ? `${last.created_at}:${last.id}` : null });
}

/** POST /api/paste/items — `{ content, title, language, expires_in }` */
export async function createPaste(request: Request, db: D1Database, device: Device): Promise<Response> {
  const body = await readJson(request);
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) throw new HttpError(400, "内容不能为空");
  if (new TextEncoder().encode(content).length > MAX_CONTENT_BYTES) throw new HttpError(413, "内容超过 1MB");

  const expiresIn = typeof body.expires_in === "string" ? body.expires_in : "1d";
  if (!Object.hasOwn(EXPIRY, expiresIn)) throw new HttpError(400, "过期时间无效");
  const language = typeof body.language === "string" ? body.language.trim().toLowerCase() : "";
  const time = now();
  const ttl = EXPIRY[expiresIn];
  const row: PasteRow = {
    id: "",
    title: cleanText(body.title, 200),
    language: LANGUAGE.test(language) ? language : "text",
    created_at: time,
    expires_at: ttl === null ? null : time + ttl,
    size: content.length,
    content,
    device_name: device.name,
  };

  for (let attempt = 0; ; attempt += 1) {
    row.id = randomId(8);
    try {
      // size comes from SQLite so it matches what list and get report
      // (characters, not the UTF-16 units of content.length).
      const inserted = await db
        .prepare(
          `INSERT INTO pastes (id, title, content, language, created_at, expires_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING length(content) AS size`,
        )
        .bind(row.id, row.title, content, row.language, row.created_at, row.expires_at, device.id)
        .first<{ size: number }>();
      if (inserted) row.size = inserted.size;
      break;
    } catch (error) {
      // 36^8 ids: a collision is rare enough that three tries is plenty.
      if (attempt >= 2 || !/UNIQUE|PRIMARY KEY/i.test(String(error))) throw error;
    }
  }
  return json(row, 201);
}

/** GET /api/paste/items/:id — public share link; expired items are 404 even before the cron runs. */
export async function getPaste(db: D1Database, id: string): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT id, title, content, language, created_at, expires_at, length(content) AS size
       FROM pastes WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(id, now())
    .first<PasteRow>();
  if (!row) throw new HttpError(404, "Paste 不存在或已过期");
  return json(row);
}

/** DELETE /api/paste/items/:id */
export async function deletePaste(db: D1Database, id: string): Promise<Response> {
  const result = await db.prepare("DELETE FROM pastes WHERE id = ?").bind(id).run();
  if (!result.meta.changes) throw new HttpError(404, "Paste 不存在");
  return json({ ok: true });
}
