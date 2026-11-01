/**
 * Purge the EdgeOne cache after a deploy, so the CDN in front of the Worker
 * serves the new pages right away. Optional: without an `edgeone` section in
 * the config file this does nothing.
 *
 * Uses the Tencent Cloud API (TC3-HMAC-SHA256 signature), action
 * CreatePurgeTask, version 2022-09-01.
 */
import { createHash, createHmac } from "node:crypto";

export interface EdgeOneConfig {
  secret_id?: string;
  secret_key?: string;
  /** Site id from the EdgeOne console, e.g. zone-xxxxxxxx. */
  zone_id?: string;
  /** API host; the international site uses teo.intl.tencentcloudapi.com. */
  endpoint?: string;
}

const VERSION = "2022-09-01";
const DEFAULT_ENDPOINT = "teo.intl.tencentcloudapi.com";

export function edgeOneConfigured(config: EdgeOneConfig | undefined): config is Required<Omit<EdgeOneConfig, "endpoint">> & EdgeOneConfig {
  return Boolean(config?.secret_id && config.secret_key && config.zone_id);
}

const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");
const hmac = (key: string | Buffer, text: string) => createHmac("sha256", key).update(text).digest();

/** Signed headers for one Tencent Cloud API call. Exported for testing. */
export function signRequest(options: {
  host: string;
  action: string;
  payload: string;
  secretId: string;
  secretKey: string;
  timestamp: number;
  version?: string;
}): Record<string, string> {
  const { host, action, payload, secretId, secretKey, timestamp } = options;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  // The service name is the first label of the API host (teo.intl.tencentcloudapi.com → teo).
  const service = host.split(".")[0];
  const contentType = "application/json; charset=utf-8";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:${contentType}\nhost:${host}\n`,
    "content-type;host",
    sha256Hex(payload),
  ].join("\n");
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), service), "tc3_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
    "Content-Type": contentType,
    Host: host,
    "X-TC-Action": action,
    "X-TC-Version": options.version ?? VERSION,
    "X-TC-Timestamp": String(timestamp),
  };
}

/** Delete everything EdgeOne has cached for `hostname`. Returns the purge job id. */
export async function purgeHost(config: EdgeOneConfig, hostname: string): Promise<string> {
  if (!edgeOneConfigured(config)) throw new Error("edgeone 配置缺少 secret_id、secret_key 或 zone_id");
  const host = config.endpoint || DEFAULT_ENDPOINT;
  const payload = JSON.stringify({ ZoneId: config.zone_id, Type: "purge_host", Method: "delete", Targets: [hostname] });
  const headers = signRequest({
    host,
    action: "CreatePurgeTask",
    payload,
    secretId: config.secret_id,
    secretKey: config.secret_key,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const response = await fetch(`https://${host}/`, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(30_000) });
  const body = (await response.json().catch(() => ({}))) as {
    Response?: { JobId?: string; FailedList?: { Target?: string; Reason?: string }[]; Error?: { Code?: string; Message?: string } };
  };
  const result = body.Response;
  if (!response.ok || !result || result.Error) {
    throw new Error(result?.Error ? `${result.Error.Code}：${result.Error.Message}` : `HTTP ${response.status}`);
  }
  const failed = result.FailedList ?? [];
  if (failed.length > 0) throw new Error(failed.map((item) => `${item.Target}：${item.Reason}`).join("；"));
  return result.JobId ?? "";
}
