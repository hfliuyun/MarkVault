/** /paste/<id> — public view of one paste. The Worker serves this shell for every id. */
import { api } from "./api.ts";
import { $, copyText, expiryText, flash, formatDate, formatSize, pasteUrl, show } from "./ui.ts";

const id = /^\/paste\/([a-z0-9]{8})\/?$/.exec(location.pathname)?.[1] ?? "";
const loading = $("view-loading");
const missing = $("view-missing");
const found = $("view-found");

async function start(): Promise<void> {
  if (!id) {
    show(loading, false);
    show(missing, true);
    return;
  }
  try {
    const item = await api.get(id);
    const title = item.title || item.content.split("\n", 1)[0].trim().slice(0, 60) || `Paste ${item.id}`;
    document.title = `${title} · Paste`;
    $("view-title").textContent = title;
    $("view-meta").textContent = [
      item.language,
      formatSize(item.size),
      `创建于 ${formatDate(item.created_at)}`,
      expiryText(item.expires_at),
    ].join(" · ");
    $("view-content").textContent = item.content;

    const copy = $<HTMLButtonElement>("view-copy");
    copy.addEventListener("click", async () => {
      try {
        await copyText(item.content);
        flash(copy, "已复制");
      } catch {
        flash(copy, "复制失败", 2500);
      }
    });
    const link = $<HTMLButtonElement>("view-link");
    link.addEventListener("click", async () => {
      try {
        await copyText(pasteUrl(item.id));
        flash(link, "链接已复制");
      } catch {
        flash(link, "复制失败", 2500);
      }
    });
    show(found, true);
  } catch (error) {
    $("view-missing-text").textContent = (error as Error).message;
    show(missing, true);
  } finally {
    show(loading, false);
  }
}

void start();
