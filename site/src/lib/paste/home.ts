/** /paste/ — composer, recent items, adding devices, device list (design doc 6.1). */
import { renderSVG } from "uqr";
import { ApiError, api, type Device, type PasteItem } from "./api.ts";
import {
  $,
  copyText,
  el,
  expiryText,
  flash,
  formatDate,
  formatSize,
  guessDeviceName,
  pasteUrl,
  show,
  timeAgo,
} from "./ui.ts";

const status = $("paste-status");
const lead = $("paste-lead");
const untrusted = $("paste-untrusted");
const trusted = $("paste-trusted");

let me: Device | null = null;
let items: PasteItem[] = [];
let nextCursor: string | null = null;
let lastLoad = 0;

function setStatus(text: string): void {
  status.textContent = text;
  show(status, Boolean(text));
}

/** 401 means this device was removed elsewhere: fall back to the pairing view. */
function handleError(error: unknown, prefix: string, target: HTMLElement = status): void {
  if (error instanceof ApiError && error.status === 401) {
    showUntrusted();
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  target.textContent = `${prefix}：${message}`;
  show(target, true);
}

async function start(): Promise<void> {
  try {
    const session = await api.session();
    if (session.trusted && session.device) showTrusted(session.device);
    else showUntrusted();
  } catch (error) {
    lead.textContent = "";
    const hint = error instanceof ApiError && error.status === 404 ? "（本地开发模式没有接口，用 wrangler dev 测试）" : "";
    setStatus(`连不上 Paste 服务${hint}：${(error as Error).message}`);
  }
}

// ---------- 未信任 ----------

function showUntrusted(): void {
  me = null;
  show(trusted, false);
  show(untrusted, true);
  lead.textContent = "这台设备还没有被信任。";
  const name = $<HTMLInputElement>("pair-name");
  if (!name.value) name.value = guessDeviceName();
}

$<HTMLFormElement>("pair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("pair-submit");
  const error = $("pair-error");
  show(error, false);
  button.disabled = true;
  try {
    const session = await api.pair({
      code: $<HTMLInputElement>("pair-code").value,
      name: $<HTMLInputElement>("pair-name").value,
    });
    if (session.device) showTrusted(session.device);
  } catch (err) {
    error.textContent = (err as Error).message;
    show(error, true);
  } finally {
    button.disabled = false;
  }
});

// ---------- 已信任 ----------

function showTrusted(device: Device): void {
  me = device;
  show(untrusted, false);
  show(trusted, true);
  setStatus("");
  lead.textContent = `已信任这台设备 · ${device.name}`;
  void loadItems();
}

async function loadItems(more = false): Promise<void> {
  const moreButton = $<HTMLButtonElement>("paste-more");
  moreButton.disabled = true;
  try {
    const page = await api.list(more ? (nextCursor ?? undefined) : undefined);
    items = more ? [...items, ...page.items] : page.items;
    nextCursor = page.next_cursor;
    lastLoad = Date.now();
    renderItems();
  } catch (error) {
    handleError(error, "加载失败");
  } finally {
    moreButton.disabled = false;
  }
}

function renderItems(): void {
  const list = $("paste-list");
  list.replaceChildren(...items.map(renderItem));
  show($("paste-empty"), items.length === 0);
  show($("paste-more"), nextCursor !== null);
}

function snippet(item: PasteItem): string {
  if (item.content === null) return `（内容较长，${formatSize(item.size)}，打开查看或直接复制）`;
  return item.content.length > 400 ? `${item.content.slice(0, 400)}…` : item.content;
}

function renderItem(item: PasteItem): HTMLLIElement {
  const info = [item.language, timeAgo(item.created_at), item.device_name, expiryText(item.expires_at)]
    .filter(Boolean)
    .join(" · ");
  const body = el("a", { class: "body", href: `/paste/${item.id}` }, [
    item.title ? el("div", { class: "title", text: item.title }) : null,
    el("div", { class: "snippet", text: snippet(item) }),
    el("div", { class: "info", text: info, title: `创建于 ${formatDate(item.created_at)}` }),
  ]);

  const copy = el("button", { class: "btn", type: "button", text: "复制" });
  copy.addEventListener("click", async () => {
    try {
      // Large items are not in the list; fetch them inside the click so the copy is still allowed.
      await copyText(item.content ?? api.get(item.id).then((full) => full.content));
      flash(copy, "已复制");
    } catch (error) {
      flash(copy, error instanceof ApiError ? error.message : "复制失败", 2500);
    }
  });

  const link = el("button", { class: "btn", type: "button", text: "链接" });
  link.addEventListener("click", async () => {
    try {
      await copyText(pasteUrl(item.id));
      flash(link, "链接已复制");
    } catch {
      flash(link, "复制失败", 2500);
    }
  });

  const remove = el("button", { class: "btn btn-danger", type: "button", text: "删除" });
  remove.addEventListener("click", async () => {
    // First click arms the button for 3 seconds; the second one deletes.
    if (remove.dataset.armed !== "1") {
      remove.dataset.armed = "1";
      flash(remove, "确认删除", 3000);
      window.setTimeout(() => delete remove.dataset.armed, 3000);
      return;
    }
    remove.disabled = true;
    try {
      await api.remove(item.id);
      items = items.filter((other) => other.id !== item.id);
      renderItems();
    } catch (error) {
      remove.disabled = false;
      handleError(error, "删除失败");
    }
  });

  return el("li", { class: "paste-item" }, [body, el("div", { class: "actions" }, [copy, link, remove])]);
}

$("paste-more").addEventListener("click", () => void loadItems(true));

// Coming back to the tab (e.g. after pasting on the phone) refreshes the list.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && me && Date.now() - lastLoad > 10_000 && items.length <= 20) {
    void loadItems();
  }
});

// ---------- 输入框 ----------

const form = $<HTMLFormElement>("composer");
const content = $<HTMLTextAreaElement>("composer-content");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("composer-error");
  show(error, false);
  if (!content.value.trim()) {
    content.focus();
    return;
  }
  const button = $<HTMLButtonElement>("composer-save");
  button.disabled = true;
  try {
    const item = await api.create({
      content: content.value,
      title: $<HTMLInputElement>("composer-title").value,
      language: $<HTMLSelectElement>("composer-language").value,
      expires_in: $<HTMLSelectElement>("composer-expiry").value,
    });
    items = [item, ...items];
    renderItems();
    content.value = "";
    $<HTMLInputElement>("composer-title").value = "";
  } catch (err) {
    handleError(err, "保存失败", error);
  } finally {
    button.disabled = false;
  }
});

content.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// ---------- 添加设备 ----------

const invite = $("invite");
let countdown = 0;

async function openInvite(): Promise<void> {
  window.clearInterval(countdown);
  const button = $<HTMLButtonElement>("invite-open");
  button.disabled = true;
  try {
    const pair = await api.pairCode();
    const link = `${location.origin}/paste/pair/#t=${pair.token}`;
    // SVG is generated from our own token, not user input.
    $("invite-qr").innerHTML = renderSVG(link, { border: 2, ecc: "M" });
    $("invite-code").textContent = `${pair.code.slice(0, 3)} ${pair.code.slice(3)}`;
    $("invite-origin").textContent = `${location.host}/paste`;
    invite.classList.remove("expired");
    show(invite, true);

    const deadline = Date.now() + pair.expires_in * 1000;
    const tick = () => {
      const left = Math.round((deadline - Date.now()) / 1000);
      if (left > 0) {
        $("invite-timer").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} 后失效`;
        return;
      }
      window.clearInterval(countdown);
      invite.classList.add("expired");
      $("invite-timer").textContent = "已失效";
      void loadDevices(); // the new device may have paired meanwhile
    };
    tick();
    countdown = window.setInterval(tick, 1000);
  } catch (error) {
    handleError(error, "生成配对码失败");
  } finally {
    button.disabled = false;
  }
}

$("invite-open").addEventListener("click", () => void openInvite());
$("invite-renew").addEventListener("click", () => void openInvite());
$("invite-close").addEventListener("click", () => {
  window.clearInterval(countdown);
  show(invite, false);
  void loadDevices();
});

// ---------- 设备管理 ----------

const devicesPanel = $<HTMLDetailsElement>("devices-panel");
devicesPanel.addEventListener("toggle", () => {
  if (devicesPanel.open) void loadDevices();
});

async function loadDevices(): Promise<void> {
  if (!devicesPanel.open) return;
  try {
    const { devices } = await api.devices();
    $("devices").replaceChildren(...devices.map(renderDevice));
  } catch (error) {
    handleError(error, "加载设备失败");
  }
}

function renderDevice(device: Device): HTMLLIElement {
  const self = device.id === me?.id;
  const rename = el("button", { class: "btn", type: "button", text: "改名" });
  rename.addEventListener("click", async () => {
    const name = window.prompt("设备名", device.name)?.trim();
    if (!name || name === device.name) return;
    try {
      const result = await api.renameDevice(device.id, name);
      device.name = result.name;
      if (self && me) {
        me.name = result.name;
        lead.textContent = `已信任这台设备 · ${result.name}`;
      }
      void loadDevices();
    } catch (error) {
      handleError(error, "改名失败");
    }
  });

  const remove = el("button", { class: "btn btn-danger", type: "button", text: "移除" });
  remove.addEventListener("click", async () => {
    const question = self
      ? "移除这台设备？移除后需要重新配对才能使用 Paste。"
      : `移除「${device.name}」？它将不能再使用 Paste。`;
    if (!window.confirm(question)) return;
    try {
      const result = await api.removeDevice(device.id);
      if (result.self) showUntrusted();
      else void loadDevices();
    } catch (error) {
      handleError(error, "移除失败");
    }
  });

  return el("li", { class: "device" }, [
    el("div", { class: "body" }, [
      el("div", { class: "title" }, [device.name, self ? el("span", { class: "badge", text: "当前设备" }) : null]),
      el("div", {
        class: "info",
        text: `最近使用 ${timeAgo(device.last_seen_at)} · 添加于 ${formatDate(device.created_at)}`,
        title: device.user_agent,
      }),
    ]),
    el("div", { class: "actions" }, [rename, remove]),
  ]);
}

void start();
