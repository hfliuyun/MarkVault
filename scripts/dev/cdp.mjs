// Minimal headless-Chrome driver over the DevTools protocol (no deps).
// Usage: node cdp.mjs <url> <waitMs> <js-expression>
import { spawn } from "node:child_process";

const [url, waitMs = "4000", expression = "document.title"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333;
const chrome = spawn(CHROME, [
  "--headless=new", "--no-proxy-server", "--disable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TMPDIR ?? "/tmp"}/mv-cdp-profile`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets;
for (let i = 0; i < 50; i += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (targets.length) break;
  } catch {}
  await sleep(200);
}
const page = targets.find((item) => item.type === "page");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) pending.get(message.id)(message);
  if (message.method === "Runtime.consoleAPICalled") {
    console.error("console:", message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

await send("Runtime.enable");
await send("Page.enable");
if (process.env.WIDTH) {
  await send("Emulation.setDeviceMetricsOverride", { width: Number(process.env.WIDTH), height: Number(process.env.HEIGHT ?? 1000), deviceScaleFactor: 1, mobile: Number(process.env.WIDTH) < 500 });
}
if (process.env.SCHEME) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: process.env.SCHEME }] });
}
await send("Page.navigate", { url });
await sleep(Number(waitMs));
const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(result.result?.result?.value ?? result.result, null, 2));
if (process.env.SHOT) {
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  (await import("node:fs")).writeFileSync(process.env.SHOT, Buffer.from(shot.result.data, "base64"));
}
socket.close();
chrome.kill();
process.exit(0);
