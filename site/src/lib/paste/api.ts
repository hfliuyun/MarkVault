/** Browser client for /api/paste/* (design doc 6.4). */

export interface PasteItem {
  id: string;
  title: string;
  language: string;
  created_at: number;
  expires_at: number | null;
  /** Length in characters. */
  size: number;
  /** null in the list when the item is too big to inline; fetch it with getPaste. */
  content: string | null;
  device_name?: string | null;
}

export interface Device {
  id: string;
  name: string;
  created_at: number;
  last_seen_at: number;
  user_agent: string;
}

export interface SessionInfo {
  trusted: boolean;
  device: Device | null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/paste/${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "网络连接失败");
  }
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new ApiError(response.status, data?.error ?? `请求失败（${response.status}）`);
  return data as T;
}

export const api = {
  session: () => request<SessionInfo>("GET", "session"),
  list: (before?: string) =>
    request<{ items: PasteItem[]; next_cursor: string | null }>(
      "GET",
      `items?limit=20${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    ),
  create: (input: { content: string; title: string; language: string; expires_in: string }) =>
    request<PasteItem>("POST", "items", input),
  get: (id: string) => request<PasteItem & { content: string }>("GET", `items/${encodeURIComponent(id)}`),
  remove: (id: string) => request<{ ok: true }>("DELETE", `items/${encodeURIComponent(id)}`),
  pairCode: () =>
    request<{ code: string; token: string; expires_at: number; expires_in: number }>("POST", "pair-codes", {}),
  pair: (input: { code?: string; token?: string; name: string }) => request<SessionInfo>("POST", "pair", input),
  devices: () => request<{ devices: Device[] }>("GET", "devices"),
  renameDevice: (id: string, name: string) => request<{ ok: true; name: string }>("PATCH", `devices/${id}`, { name }),
  removeDevice: (id: string) => request<{ ok: true; self: boolean }>("DELETE", `devices/${id}`),
};
