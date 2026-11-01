/** DOM and formatting helpers for the Paste pages. User text only ever goes through textContent. */

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; href?: string; title?: string; type?: string } = {},
  children: (Node | string | null | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.href !== undefined) node.setAttribute("href", props.href);
  if (props.title !== undefined) node.title = props.title;
  if (props.type !== undefined) node.setAttribute("type", props.type);
  for (const child of children) if (child) node.append(child);
  return node;
}

export function show(element: HTMLElement, visible: boolean): void {
  element.hidden = !visible;
}

const relative = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

/** Round first, then pick the unit, so 59.6 minutes reads "1 小时" rather than "60 分钟". */
function roughDuration(seconds: number): { value: number; unit: "minute" | "hour" | "day" } {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return { value: minutes, unit: "minute" };
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return { value: hours, unit: "hour" };
  return { value: Math.round(seconds / 86400), unit: "day" };
}

/** "刚刚", "3 分钟前", "2 天前"; older than a month falls back to a date. */
export function timeAgo(seconds: number): string {
  const ago = Date.now() / 1000 - seconds;
  if (ago < 45) return "刚刚";
  if (ago >= 30 * 86400) return formatDate(seconds);
  const { value, unit } = roughDuration(ago);
  return relative.format(-value, unit);
}

export function formatDate(seconds: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

/** "永不过期" or "3 小时后过期". */
export function expiryText(expiresAt: number | null): string {
  if (expiresAt === null) return "永不过期";
  const left = expiresAt - Date.now() / 1000;
  if (left <= 0) return "已过期";
  const { value, unit } = roughDuration(left);
  return `${value} ${unit === "minute" ? "分钟" : unit === "hour" ? "小时" : "天"}后过期`;
}

export function formatSize(chars: number): string {
  return chars < 10_000 ? `${chars} 字符` : `${(chars / 1000).toFixed(chars < 100_000 ? 1 : 0)}k 字符`;
}

/** A readable default device name, e.g. "iPhone · Safari". The user can edit it. */
export function guessDeviceName(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "设备";
  const browser = /MicroMessenger/.test(ua)
    ? "微信"
    : /Edg\//.test(ua)
      ? "Edge"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return browser ? `${os} · ${browser}` : os;
}

export function inWeChat(): boolean {
  return /MicroMessenger/.test(navigator.userAgent);
}

/**
 * Copy text. Passing a promise keeps the user gesture alive while the text is
 * still loading (Safari drops the permission after an await).
 */
export async function copyText(text: string | Promise<string>): Promise<void> {
  if (typeof text !== "string" && typeof ClipboardItem !== "undefined") {
    const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}

/** Temporarily replace a button's label, e.g. "已复制". */
export function flash(button: HTMLButtonElement, label: string, ms = 1500): void {
  const original = button.dataset.label ?? button.textContent ?? "";
  button.dataset.label = original;
  button.textContent = label;
  clearTimeout(Number(button.dataset.timer));
  button.dataset.timer = String(window.setTimeout(() => (button.textContent = original), ms));
}

export function pasteUrl(id: string): string {
  return `${location.origin}/paste/${id}`;
}
