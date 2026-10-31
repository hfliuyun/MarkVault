import { createHash } from "node:crypto";
import { DELIVERY_TRANSFORM, PASSTHROUGH_FORMATS, cloudinaryPublicId, normalizeFormat } from "@markvault/content";

export interface CloudinaryCredentials {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}

export interface UploadedAsset {
  public_id: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
}

export function requireCredentials(value: Partial<CloudinaryCredentials> | undefined): CloudinaryCredentials {
  const missing = (["cloud_name", "api_key", "api_secret"] as const).filter((key) => !value?.[key]);
  if (missing.length > 0) {
    throw new Error(`Cloudinary 配置缺少 ${missing.join("、")}，请填写 ~/.config/markvault/config.json 的 cloudinary 字段`);
  }
  return value as CloudinaryCredentials;
}

/** Cloudinary request signature: sorted params joined with "&", plus the secret, SHA-1. */
export function signParams(params: Record<string, string>, secret: string): string {
  const text = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(text + secret).digest("hex");
}

/**
 * Signed upload with a content-addressed public_id. Uploading the same hash
 * twice is harmless: overwrite=false returns the existing asset.
 */
export async function uploadImage(
  credentials: CloudinaryCredentials,
  hash: string,
  data: Buffer,
  extension: string,
): Promise<UploadedAsset> {
  const format = normalizeFormat(extension);
  const params: Record<string, string> = {
    public_id: cloudinaryPublicId(hash),
    overwrite: "false",
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  if (!PASSTHROUGH_FORMATS.has(format)) params.eager = DELIVERY_TRANSFORM;

  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append("api_key", credentials.api_key);
  form.append("signature", signParams(params, credentials.api_secret));
  form.append("file", new Blob([new Uint8Array(data)]), `${hash}.${format}`);

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloud_name)}/image/upload`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
      if (!response.ok) {
        const message = body.error?.message ?? `HTTP ${response.status}`;
        // 4xx (bad credentials, invalid file) will not succeed on retry.
        if (response.status < 500) throw Object.assign(new Error(`Cloudinary 拒绝上传：${message}`), { fatal: true });
        throw new Error(`Cloudinary 返回 ${response.status}：${message}`);
      }
      return {
        public_id: String(body.public_id),
        format: String(body.format ?? format),
        width: typeof body.width === "number" ? body.width : undefined,
        height: typeof body.height === "number" ? body.height : undefined,
        bytes: typeof body.bytes === "number" ? body.bytes : data.length,
      };
    } catch (error) {
      lastError = error;
      if ((error as { fatal?: boolean }).fatal) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
