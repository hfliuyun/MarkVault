// Paste 接口的端到端检查。只删除它自己创建的 paste 和设备，可以对线上运行。
//
//   node scripts/dev/paste-smoke.mjs <paste-invite 打印的链接>
//
// 本地：npm run markvault -- paste-invite --local，然后把链接传进来（需要 wrangler dev 在 8787 端口运行）。
const link = new URL(process.argv[2] ?? "");
const origin = link.origin;
const inviteToken = new URLSearchParams(link.hash.slice(1)).get("t");
const api = `${origin}/api/paste`;

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? `：${detail}` : ""}`);
  }
}

async function call(method, path, { cookie, body, origin: sendOrigin = origin, type = "application/json" } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (sendOrigin) headers.Origin = sendOrigin;
  if (body !== undefined) headers["Content-Type"] = type;
  const response = await fetch(`${api}/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: response.status, data, setCookie: response.headers.get("set-cookie") ?? "", headers: response.headers };
}

const cookieOf = (setCookie) => setCookie.split(";")[0];

console.log(`目标：${origin}`);

console.log("未信任");
let r = await call("GET", "session");
check("session 返回 trusted:false", r.status === 200 && r.data?.trusted === false, JSON.stringify(r.data));
check("API 响应 no-store", r.headers.get("cache-control") === "no-store");
r = await call("GET", "items");
check("未信任读列表 401", r.status === 401);
r = await call("POST", "items", { body: { content: "x" } });
check("未信任写入 401", r.status === 401);

console.log("CSRF 和输入检查");
r = await call("POST", "pair", { body: { token: inviteToken, name: "x" }, origin: null });
check("没有 Origin 403", r.status === 403);
r = await call("POST", "pair", { body: { token: inviteToken, name: "x" }, origin: "https://evil.example" });
check("外站 Origin 403", r.status === 403);
r = await call("POST", "pair", { body: JSON.stringify({ token: inviteToken }), type: "text/plain" });
check("非 JSON 415", r.status === 415);
r = await call("POST", "pair", { body: "{bad", type: "application/json" });
check("坏 JSON 400", r.status === 400);
r = await call("POST", "pair", { body: { token: "A".repeat(43), name: "x" } });
check("不存在的 token 400", r.status === 400);

console.log("终端邀请配对");
r = await call("POST", "pair", { body: { token: inviteToken, name: "smoke-test A" } });
check("配对成功 201", r.status === 201 && r.data?.device?.name === "smoke-test A", `${r.status} ${JSON.stringify(r.data)}`);
const sc = r.setCookie;
check(
  "cookie 属性",
  /^mv_device=[A-Za-z0-9_-]{43};/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\/api\/paste/.test(sc) && /Max-Age=31536000/.test(sc),
  sc,
);
const cookieA = cookieOf(sc);
const deviceA = r.data?.device?.id;
r = await call("POST", "pair", { body: { token: inviteToken, name: "again" } });
check("同一个链接只能用一次", r.status === 400);
r = await call("GET", "session", { cookie: cookieA });
check("session 已信任", r.data?.trusted === true && r.data?.device?.id === deviceA);
check("一天内不重复续期", r.setCookie === "", r.setCookie);
r = await call("GET", "session", { cookie: "mv_device=garbage" });
check("坏 cookie 被清除", r.data?.trusted === false && /Max-Age=0/.test(r.setCookie));

console.log("Paste");
r = await call("POST", "items", { cookie: cookieA, body: { content: "echo 'smoke' && ls\n第二行", title: "smoke 标题", language: "bash", expires_in: "1h" } });
check("创建 201", r.status === 201 && /^[a-z0-9]{8}$/.test(r.data?.id ?? ""), JSON.stringify(r.data));
const item = r.data;
check("1h 过期时间", item && item.expires_at - item.created_at === 3600);
r = await call("POST", "items", { cookie: cookieA, body: { content: "   " } });
check("空内容 400", r.status === 400);
r = await call("POST", "items", { cookie: cookieA, body: { content: "x", expires_in: "1y" } });
check("无效过期时间 400", r.status === 400);
r = await call("POST", "items", { cookie: cookieA, body: { content: "中".repeat(400_000) } });
check("超过 1MB 413", r.status === 413, String(r.status));
r = await call("POST", "items", { cookie: cookieA, body: { content: "y", language: "<script>" } });
check("非法语言名改成 text", r.status === 201 && r.data?.language === "text");
const extra = [r.data?.id];
r = await call("POST", "items", { cookie: cookieA, origin: "https://evil.example", body: { content: "x" } });
check("已信任但外站 Origin 403", r.status === 403);

r = await call("GET", "items", { cookie: cookieA });
const listed = r.data?.items?.find((other) => other.id === item?.id);
check("列表包含新建的，带完整内容和设备名", listed?.content === item?.content && listed?.device_name === "smoke-test A", JSON.stringify(listed));
r = await call("GET", `items/${item?.id}`);
check("公开读取单条（不带 cookie）", r.status === 200 && r.data?.content === item?.content && !("device_name" in (r.data ?? {})));
r = await call("GET", "items/zzzzzzzz");
check("不存在的 paste 404", r.status === 404);

for (let i = 0; i < 3; i += 1) {
  const created = await call("POST", "items", { cookie: cookieA, body: { content: `page ${i}`, expires_in: "1h" } });
  extra.push(created.data?.id);
}
r = await call("GET", "items?limit=2", { cookie: cookieA });
const page1 = r.data;
check("分页：limit=2 有 next_cursor", page1?.items?.length === 2 && typeof page1?.next_cursor === "string");
r = await call("GET", `items?limit=2&before=${encodeURIComponent(page1?.next_cursor ?? "")}`, { cookie: cookieA });
const ids1 = new Set(page1?.items?.map((other) => other.id));
check("分页：第二页不重复", r.data?.items?.length > 0 && r.data.items.every((other) => !ids1.has(other.id)));

const page = await fetch(`${origin}/paste/${item?.id}`, { redirect: "manual" });
const html = await page.text();
check("/paste/<id> 返回查看页外壳", page.status === 200 && html.includes('id="view-content"'), String(page.status));
check("/paste/<id> 带 noindex", page.headers.get("x-robots-tag") === "noindex");
const pairPage = await fetch(`${origin}/paste/pair/`, { redirect: "manual" });
check("/paste/pair/ 是确认页", pairPage.status === 200 && (await pairPage.text()).includes('id="pair-confirm"'));

console.log("配对码");
r = await call("POST", "pair-codes", { cookie: cookieA, body: {} });
check("生成配对码", r.status === 201 && /^\d{6}$/.test(r.data?.code ?? "") && r.data?.expires_in === 120);
const code1 = r.data?.code;
const wrong = code1 === "000000" ? "000001" : "000000";
for (let i = 0; i < 5; i += 1) await call("POST", "pair", { body: { code: wrong, name: "x" } });
r = await call("POST", "pair", { body: { code: code1, name: "x" } });
check("输错 5 次后正确的码也作废", r.status === 400, String(r.status));
r = await call("POST", "pair-codes", { cookie: cookieA, body: {} });
r = await call("POST", "pair", { body: { code: `${r.data?.code.slice(0, 3)} ${r.data?.code.slice(3)}`, name: "smoke-test B" } });
check("配对码配对成功（带空格）", r.status === 201 && r.data?.device?.name === "smoke-test B", `${r.status} ${JSON.stringify(r.data)}`);
const cookieB = cookieOf(r.setCookie);
const deviceB = r.data?.device?.id;

console.log("设备管理");
r = await call("GET", "devices", { cookie: cookieB });
check("设备列表包含 A 和 B", [deviceA, deviceB].every((id) => r.data?.devices?.some((device) => device.id === id)));
r = await call("PATCH", `devices/${deviceB}`, { cookie: cookieA, body: { name: "  smoke-test\nB2  " } });
check("改名（清理空白）", r.status === 200 && r.data?.name === "smoke-test B2", JSON.stringify(r.data));
r = await call("PATCH", `devices/${deviceB}`, { cookie: cookieA, body: { name: " " } });
check("空名字 400", r.status === 400);
r = await call("DELETE", `devices/${deviceB}`, { cookie: cookieA });
check("移除别的设备", r.status === 200 && r.data?.self === false && r.setCookie === "");
r = await call("GET", "session", { cookie: cookieB });
check("被移除的设备不再信任，cookie 被清除", r.data?.trusted === false && /Max-Age=0/.test(r.setCookie));

console.log("路由");
r = await call("GET", "nope");
check("未知接口 404", r.status === 404);
r = await call("PUT", "items", { cookie: cookieA, body: {} });
check("错误的方法 405", r.status === 405);

console.log("清理");
for (const id of [item?.id, ...extra]) {
  if (!id) continue;
  r = await call("DELETE", `items/${id}`, { cookie: cookieA });
  if (r.status !== 200) check(`删除 ${id}`, false, String(r.status));
}
r = await call("GET", `items/${item?.id}`);
check("删除后 404", r.status === 404);
r = await call("DELETE", `devices/${deviceA}`, { cookie: cookieA });
check("移除自己，cookie 被清除", r.data?.self === true && /Max-Age=0/.test(r.setCookie));
r = await call("GET", "items", { cookie: cookieA });
check("移除自己后 401", r.status === 401);

console.log(failures ? `\n✗ ${failures} 项失败` : "\n✓ 全部通过");
process.exit(failures ? 1 : 0);
