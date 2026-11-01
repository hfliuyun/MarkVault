/**
 * Device trust (design doc 6.2, 6.3): a year-long HttpOnly cookie per device,
 * pairing by 6-digit code or one-time link, and device management.
 */
import {
  DEVICE_COOKIE,
  HttpError,
  SMALL_BODY_BYTES,
  TOKEN_PATTERN,
  cleanText,
  clearDeviceCookie,
  deviceCookie,
  json,
  now,
  randomCode,
  randomId,
  randomToken,
  readCookie,
  readJson,
  sha256Hex,
} from "./http.ts";

export interface Device {
  id: string;
  name: string;
  created_at: number;
  last_seen_at: number;
  user_agent: string;
}

export interface Session {
  device: Device | null;
  /** Set-Cookie to add to the response: renewal, or clearing a stale cookie. */
  setCookie?: string;
}

/** Renew last_seen_at and the cookie at most once a day per device. */
const RENEW_AFTER = 24 * 3600;
/** Codes made on a trusted device ("添加设备") live 2 minutes; terminal invites 10 (set by the CLI). */
const PAIR_CODE_TTL = 120;
const MAX_CODE_ATTEMPTS = 5;
const DEVICE_COLUMNS = "id, name, created_at, last_seen_at, user_agent";

export async function getSession(request: Request, db: D1Database): Promise<Session> {
  const token = readCookie(request, DEVICE_COOKIE);
  if (!token) return { device: null };
  if (!TOKEN_PATTERN.test(token)) return { device: null, setCookie: clearDeviceCookie() };

  const device = await db
    .prepare(`SELECT ${DEVICE_COLUMNS} FROM devices WHERE token_hash = ?`)
    .bind(await sha256Hex(token))
    .first<Device>();
  if (!device) return { device: null, setCookie: clearDeviceCookie() };

  const time = now();
  if (time - device.last_seen_at < RENEW_AFTER) return { device };
  await db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(time, device.id).run();
  return { device: { ...device, last_seen_at: time }, setCookie: deviceCookie(token) };
}

export function sessionInfo(session: Session): Response {
  return json({ trusted: Boolean(session.device), device: session.device });
}

/** POST /api/paste/pair-codes — "添加设备" on a trusted device. */
export async function createPairCode(db: D1Database, device: Device): Promise<Response> {
  const token = randomToken();
  const code = randomCode();
  const expiresAt = now() + PAIR_CODE_TTL;
  await db
    .prepare(
      "INSERT INTO pair_codes (id, token_hash, code_hash, expires_at, created_by_device) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(randomId(12), await sha256Hex(token), await sha256Hex(code), expiresAt, device.id)
    .run();
  // expires_in lets the page count down without trusting the device clock.
  return json({ code, token, expires_at: expiresAt, expires_in: PAIR_CODE_TTL }, 201);
}

/** POST /api/paste/pair — `{ token }` or `{ code }`, plus `name`. Sets the device cookie. */
export async function pairDevice(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson(request, SMALL_BODY_BYTES);
  const time = now();

  if (typeof body.token === "string" && body.token) {
    if (!TOKEN_PATTERN.test(body.token)) throw new HttpError(400, "链接无效或已过期");
    const claimed = await db
      .prepare(
        "UPDATE pair_codes SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING id",
      )
      .bind(time, await sha256Hex(body.token), time)
      .first();
    if (!claimed) throw new HttpError(400, "链接无效或已过期，请重新生成");
  } else {
    const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, "请输入 6 位数字配对码");
    // Every try, right or wrong, counts against every live code: a wrong guess
    // cannot be tied to one row. Counting first and claiming in the same batch
    // (D1 runs a batch as one transaction) means parallel requests cannot all
    // pass the check before any count lands. 5 tries over 10^6 codes.
    const [, claim] = await db.batch<{ id: string }>([
      db
        .prepare("UPDATE pair_codes SET attempts = attempts + 1 WHERE code_hash IS NOT NULL AND used_at IS NULL AND expires_at > ?")
        .bind(time),
      db
        .prepare(
          `UPDATE pair_codes SET used_at = ?
           WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? AND attempts <= ?
           RETURNING id`,
        )
        .bind(time, await sha256Hex(code), time, MAX_CODE_ATTEMPTS),
    ]);
    if (!claim?.results.length) throw new HttpError(400, "配对码不正确或已过期");
  }

  const token = randomToken();
  const device: Device = {
    id: randomId(10),
    name: cleanText(body.name, 40) || "未命名设备",
    created_at: time,
    last_seen_at: time,
    user_agent: (request.headers.get("User-Agent") ?? "").slice(0, 300),
  };
  await db
    .prepare(`INSERT INTO devices (${DEVICE_COLUMNS}, token_hash) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(device.id, device.name, device.created_at, device.last_seen_at, device.user_agent, await sha256Hex(token))
    .run();
  return json({ trusted: true, device }, 201, { "Set-Cookie": deviceCookie(token) });
}

/** GET /api/paste/devices */
export async function listDevices(db: D1Database): Promise<Response> {
  const { results } = await db.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices ORDER BY last_seen_at DESC`).all<Device>();
  return json({ devices: results });
}

/** PATCH /api/paste/devices/:id — `{ name }` */
export async function renameDevice(request: Request, db: D1Database, id: string): Promise<Response> {
  const name = cleanText((await readJson(request, SMALL_BODY_BYTES)).name, 40);
  if (!name) throw new HttpError(400, "设备名不能为空");
  const result = await db.prepare("UPDATE devices SET name = ? WHERE id = ?").bind(name, id).run();
  if (!result.meta.changes) throw new HttpError(404, "设备不存在");
  return json({ ok: true, name });
}

/** DELETE /api/paste/devices/:id — removing yourself also clears your cookie. */
export async function removeDevice(db: D1Database, id: string, current: Device): Promise<Response> {
  const result = await db.prepare("DELETE FROM devices WHERE id = ?").bind(id).run();
  if (!result.meta.changes) throw new HttpError(404, "设备不存在");
  const self = id === current.id;
  return json({ ok: true, self }, 200, self ? { "Set-Cookie": clearDeviceCookie() } : undefined);
}
