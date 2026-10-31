import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeFormat, writeManifest, type ImageManifest, type VaultModel } from "@markvault/content";
import { compressImage, displaySize } from "./compress.ts";
import { uploadImage, type CloudinaryCredentials } from "./cloudinary.ts";

export interface UploadReport {
  uploaded: number;
  bytesOriginal: number;
  bytesUploaded: number;
}

type Log = (line: string) => void;

const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`;

/**
 * Compress and upload every local image that published notes reference but
 * images.json does not know yet, then rewrite images.json. Paths are rebuilt
 * from the current references, so renamed or deleted files drop out.
 */
export async function syncImages(model: VaultModel, credentials: CloudinaryCredentials, log: Log): Promise<UploadReport> {
  const manifest: ImageManifest = {
    version: 1,
    paths: {},
    assets: { ...model.manifest.assets },
  };
  const report: UploadReport = { uploaded: 0, bytesOriginal: 0, bytesUploaded: 0 };

  const pending = [...model.pendingImages.keys()].sort();
  let index = 0;
  for (const relative of pending) {
    index += 1;
    const sha256 = model.pendingImages.get(relative)!;
    const key = sha256.slice(0, 16);
    if (manifest.assets[key]) continue; // same file referenced under two paths
    const original = await readFile(path.join(model.root, relative));
    const extension = path.extname(relative);
    const compressed = await compressImage(original, extension);
    const size = await displaySize(original);
    const uploaded = await uploadImage(credentials, key, compressed.data, extension);
    manifest.assets[key] = {
      sha256,
      public_id: uploaded.public_id,
      format: normalizeFormat(uploaded.format || extension),
      width: size.width ?? uploaded.width,
      height: size.height ?? uploaded.height,
      bytes_original: original.length,
      bytes_uploaded: compressed.data.length,
      compressor: compressed.compressor,
      uploaded_at: new Date().toISOString(),
    };
    report.uploaded += 1;
    report.bytesOriginal += original.length;
    report.bytesUploaded += compressed.data.length;
    const note = compressed.note ? `（${compressed.note}）` : "";
    log(`  [${index}/${pending.length}] ${relative}  ${kb(original.length)} → ${kb(compressed.data.length)}${note}`);
  }

  await writeManifestPaths(model, manifest);
  return report;
}

/** Rebuild images.json paths from the images published notes reference now. */
export async function writeManifestPaths(model: VaultModel, manifest: ImageManifest = model.manifest): Promise<void> {
  const next: ImageManifest = { version: 1, paths: {}, assets: manifest.assets };
  for (const item of [...model.posts, ...model.series]) {
    for (const image of item.images) {
      if (image.resolvedPath && image.hash && next.assets[image.hash]) next.paths[image.resolvedPath] = image.hash;
    }
  }
  await writeManifest(model.root, next);
}
