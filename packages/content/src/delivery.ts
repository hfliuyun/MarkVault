/**
 * How images are stored on and delivered from Cloudinary. Shared by the CLI
 * (upload + eager transformation), the renderer (width/height attributes)
 * and the /img Worker (upstream URL). Keep this file dependency-free: the
 * Worker bundles it.
 */

/** Folder for every MarkVault asset; public_id = `${FOLDER}/<hash>`. */
export const CLOUDINARY_FOLDER = "markvault";

/** Longest edge delivered for raster images. */
export const DELIVERY_MAX_WIDTH = 1600;

/**
 * The only transformation the site requests. It is generated eagerly at upload,
 * so Cloudinary's Strict Transformations can reject every other variant.
 */
export const DELIVERY_TRANSFORM = `f_webp,q_auto,c_limit,w_${DELIVERY_MAX_WIDTH}`;

/** Formats delivered as they were uploaded (no transformation). */
export const PASSTHROUGH_FORMATS = new Set(["svg", "gif"]);

export function normalizeFormat(extension: string): string {
  const ext = extension.toLowerCase().replace(/^\./, "");
  return ext === "jpeg" ? "jpg" : ext;
}

export function cloudinaryPublicId(hash: string): string {
  return `${CLOUDINARY_FOLDER}/${hash}`;
}

/** Upstream URL for a site path segment like "abcd….webp" or "raw/abcd….png". */
export function cloudinaryDeliveryUrl(cloud: string, hash: string, format: string, raw: boolean): string {
  const base = `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload`;
  const id = cloudinaryPublicId(hash);
  if (raw || PASSTHROUGH_FORMATS.has(format)) return `${base}/${id}.${format}`;
  return `${base}/${DELIVERY_TRANSFORM}/${id}`;
}
