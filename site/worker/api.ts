/** /api/paste/* router (design doc 6.4). */
import {
  createPairCode,
  getSession,
  listDevices,
  pairDevice,
  removeDevice,
  renameDevice,
  sessionInfo,
  type Device,
  type Session,
} from "./devices.ts";
import { HttpError, assertSameOrigin, errorResponse } from "./http.ts";
import { createPaste, deletePaste, getPaste, listPastes } from "./paste.ts";

export interface ApiEnv {
  DB: D1Database;
  /** Public address of the site, e.g. https://blog.example.com (see http.ts assertSameOrigin). */
  SITE_ORIGIN?: string;
}

interface Context {
  request: Request;
  db: D1Database;
  id: string;
  session: Session;
  /** Only set on trusted routes. */
  device: Device;
}

interface Route {
  method: string;
  pattern: RegExp;
  /** "public": no device needed. "session": looks up the device but does not require one. */
  access: "public" | "session" | "trusted";
  handle(context: Context): Promise<Response> | Response;
}

const ID = "([a-z0-9]{8})";
const DEVICE_ID = "([a-z0-9]{10})";
const ROUTES: Route[] = [
  { method: "GET", pattern: /^session$/, access: "session", handle: (c) => sessionInfo(c.session) },
  { method: "GET", pattern: /^items$/, access: "trusted", handle: (c) => listPastes(c.request, c.db) },
  { method: "POST", pattern: /^items$/, access: "trusted", handle: (c) => createPaste(c.request, c.db, c.device) },
  { method: "GET", pattern: new RegExp(`^items/${ID}$`), access: "public", handle: (c) => getPaste(c.db, c.id) },
  { method: "DELETE", pattern: new RegExp(`^items/${ID}$`), access: "trusted", handle: (c) => deletePaste(c.db, c.id) },
  { method: "POST", pattern: /^pair-codes$/, access: "trusted", handle: (c) => createPairCode(c.db, c.device) },
  { method: "POST", pattern: /^pair$/, access: "public", handle: (c) => pairDevice(c.request, c.db) },
  { method: "GET", pattern: /^devices$/, access: "trusted", handle: (c) => listDevices(c.db) },
  {
    method: "PATCH",
    pattern: new RegExp(`^devices/${DEVICE_ID}$`),
    access: "trusted",
    handle: (c) => renameDevice(c.request, c.db, c.id),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^devices/${DEVICE_ID}$`),
    access: "trusted",
    handle: (c) => removeDevice(c.db, c.id, c.device),
  },
];

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/paste\/?/, "").replace(/\/$/, "");
  const matches = ROUTES.filter((route) => route.pattern.test(path));
  if (matches.length === 0) return errorResponse(404, "接口不存在");
  const route = matches.find((item) => item.method === request.method);
  if (!route) {
    const allow = matches.map((item) => item.method).join(", ");
    return new Response(JSON.stringify({ error: "方法不允许" }), {
      status: 405,
      headers: { Allow: allow, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  try {
    if (request.method !== "GET") assertSameOrigin(request, env.SITE_ORIGIN);
    const session: Session = route.access === "public" ? { device: null } : await getSession(request, env.DB);
    if (route.access === "trusted" && !session.device) {
      const response = errorResponse(401, "这台设备还没有被信任");
      if (session.setCookie) response.headers.append("Set-Cookie", session.setCookie);
      return response;
    }
    const response = await route.handle({
      request,
      db: env.DB,
      id: route.pattern.exec(path)?.[1] ?? "",
      session,
      device: session.device as Device,
    });
    // A handler that sets its own cookie (pairing, removing yourself) wins over renewal.
    if (session.setCookie && !response.headers.has("Set-Cookie")) response.headers.append("Set-Cookie", session.setCookie);
    return response;
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.message);
    console.error("paste api error", error);
    return errorResponse(500, "服务器出错了，请稍后再试");
  }
}
