/** Small helpers shared by the Paste API: JSON responses, cookies, CSRF, random ids. */

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
  if (headers) new Headers(headers).forEach((value, key) => response.headers.append(key, value));
  return response;
}

export function errorResponse(status: number, message: string): Response {
  return json({ error: message }, status);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export const DEVICE_COOKIE = "mv_device";
export const DEVICE_MAX_AGE = 365 * 24 * 3600;

export function deviceCookie(token: string): string {
  return `${DEVICE_COOKIE}=${token}; Path=/api/paste; Max-Age=${DEVICE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearDeviceCookie(): string {
  return `${DEVICE_COOKIE}=; Path=/api/paste; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * CSRF (design doc 6.2): every write must come from our own pages. Browsers
 * always send Origin on POST/PATCH/DELETE; a JSON body forces a CORS preflight
 * for cross-site fetches, which we never answer.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, "来源不正确");
}

/** Upper bound for a paste body: 1MB of content can grow up to ~6x when JSON-escaped. */
const MAX_BODY_BYTES = 7 * 1024 * 1024;
/** Bodies that only carry a token, code or name. */
export const SMALL_BODY_BYTES = 4 * 1024;

/**
 * Parse a JSON object body of at most `maxBytes`. Content-Length is checked up
 * front, but a chunked request may omit it, so the stream is counted as well.
 */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, "请求必须是 JSON");
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > maxBytes) throw new HttpError(413, "内容太大");

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.releaseLock();
        throw new HttpError(413, "内容太大");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "JSON 格式不正确");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "JSON 格式不正确");
  return body as Record<string, unknown>;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** URL-safe token: 32 random bytes, base64url without padding (43 characters). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random [a-z0-9] string without modulo bias. */
export function randomId(length: number): string {
  let result = "";
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < 252 && result.length < length) result += ID_ALPHABET[byte % 36];
    }
  }
  return result;
}

/** Six decimal digits, uniformly distributed. */
export function randomCode(): string {
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values);
  while (values[0] >= 4_294_000_000); // largest multiple of 1e6 below 2^32
  return String(values[0] % 1_000_000).padStart(6, "0");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Trim, collapse whitespace, drop control characters, cap the length. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
