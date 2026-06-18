export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // 从 Cloudflare Pages 的环境变量中获取 API 域名
  // 这样就不需要把域名硬编码在代码库里了
  const apiBase = context.env.VITE_API_BASE_URL;
  
  if (!apiBase) {
    return new Response("Server Configuration Error: VITE_API_BASE_URL environment variable is missing.", { status: 500 });
  }

  // 重写目标 URL，比如将 /api/media/... 重写为 https://apiblog.liuyun.ac.cn/api/media/...
  const targetUrl = new URL(url.pathname + url.search, apiBase);
  
  // 构造代理请求并转发
  const proxyRequest = new Request(targetUrl.toString(), context.request);
  
  return fetch(proxyRequest);
}
