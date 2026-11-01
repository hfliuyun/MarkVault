/**
 * /paste/pair/#t=<token> — confirmation page for a one-time trust link
 * (design doc 6.3). Opening the link does nothing; only the button uses the
 * token, so chat apps that prefetch links cannot burn it. The token sits in
 * the fragment, which browsers never send, so it stays out of request logs.
 */
import { api } from "./api.ts";
import { $, guessDeviceName, inWeChat, show } from "./ui.ts";

const token = new URLSearchParams(location.hash.slice(1)).get("t") ?? "";
// Opening another link in the same tab only changes the fragment, which does
// not reload the page; start over so the new token is read.
addEventListener("hashchange", () => location.reload());

async function start(): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    show($("pair-invalid"), true);
    return;
  }
  try {
    const session = await api.session();
    if (session.trusted && session.device) {
      $("pair-already-name").textContent = session.device.name;
      show($("pair-already"), true);
      return;
    }
  } catch {
    // Fall through: the confirm button reports any real error.
  }
  $<HTMLInputElement>("pair-name").value = guessDeviceName();
  show($("pair-wechat"), inWeChat());
  show($("pair-confirm"), true);
}

$<HTMLFormElement>("pair-confirm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("pair-submit");
  const error = $("pair-error");
  show(error, false);
  button.disabled = true;
  try {
    await api.pair({ token, name: $<HTMLInputElement>("pair-name").value });
    location.replace("/paste/");
  } catch (err) {
    error.textContent = (err as Error).message;
    show(error, true);
    button.disabled = false;
  }
});

void start();
