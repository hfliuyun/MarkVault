import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { optimize as optimizeSvg } from "svgo";

/**
 * Lossless compression of the copy uploaded to Cloudinary (design doc 4.2).
 * The vault original is never modified. Every result is decoded and compared
 * pixel by pixel with the original; on any mismatch the original is used.
 */

export interface CompressResult {
  data: Buffer;
  /** Tool that produced `data`, or null when the original is uploaded. */
  compressor: string | null;
  /** Why the original was kept, or what was skipped. */
  note?: string;
}

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- PNG

/** Chunks that never affect how a PNG is displayed. */
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "tIME", "eXIf"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngChunk {
  type: string;
  raw: Buffer;
}

function readPngChunks(data: Buffer): PngChunk[] | null {
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > data.length) return null;
    chunks.push({ type, raw: data.subarray(offset, end) });
    offset = end;
    if (type === "IEND") break;
  }
  return chunks;
}

/** Remove text/time/EXIF chunks (EXIF may hold GPS). Keeps colour chunks. */
export function stripPngMetadata(data: Buffer): Buffer {
  const chunks = readPngChunks(data);
  if (!chunks) return data;
  return Buffer.concat([PNG_SIGNATURE, ...chunks.filter((chunk) => !PNG_DROP.has(chunk.type)).map((chunk) => chunk.raw)]);
}

function isAnimatedPng(data: Buffer): boolean {
  return readPngChunks(data)?.some((chunk) => chunk.type === "acTL") ?? false;
}

type OxipngOptimise = (data: Uint8Array, level: number, interlace: boolean, optimiseAlpha: boolean) => Uint8Array;
let oxipng: Promise<OxipngOptimise> | null = null;

function loadOxipng(): Promise<OxipngOptimise> {
  oxipng ??= (async () => {
    // The package's high-level wrapper references the browser-only ImageData
    // global, so load the single-threaded wasm codec directly.
    const entry = require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js");
    const codec = await import(entry);
    const wasm = await readFile(path.join(path.dirname(entry), "squoosh_oxipng_bg.wasm"));
    await codec.default(await WebAssembly.compile(wasm));
    return codec.optimise as OxipngOptimise;
  })();
  return oxipng;
}

async function compressPng(data: Buffer): Promise<{ data: Buffer; compressor: string; stripsMetadata: boolean }> {
  const stripped = stripPngMetadata(data);
  const stripsMetadata = stripped.length !== data.length;
  if (isAnimatedPng(stripped)) return { data: stripped, compressor: "png-strip", stripsMetadata };
  const optimise = await loadOxipng();
  // optimiseAlpha=false: fully transparent pixels keep their colour values.
  const output = Buffer.from(optimise(new Uint8Array(stripped), 2, false, false));
  return { data: output, compressor: "oxipng-wasm -o2", stripsMetadata };
}

// ---------------------------------------------------------------- JPEG

/**
 * Minimal EXIF APP1 segment holding only the Orientation tag, so rotated
 * photos keep displaying correctly after all other EXIF (GPS, camera) is gone.
 */
export function orientationExifSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1"); // big-endian
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18); // value (left-justified in 4 bytes)
  tiff.writeUInt32BE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** Insert an APP segment after SOI and any APP0 (JFIF) segment. */
export function insertJpegSegment(jpeg: Buffer, segment: Buffer): Buffer {
  let offset = 2; // after SOI
  if (jpeg.readUInt16BE(offset) === 0xffe0) offset += 2 + jpeg.readUInt16BE(offset + 2);
  return Buffer.concat([jpeg.subarray(0, offset), segment, jpeg.subarray(offset)]);
}

let jpegtranPath: Promise<string | null> | null = null;

export function findTool(name: string): Promise<string | null> {
  return execFileAsync("/usr/bin/env", ["which", name]).then(
    ({ stdout }) => stdout.trim() || null,
    () => null,
  );
}

function runTool(binary: string, args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    // The tool may exit before reading all input; the exit code reports it.
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${path.basename(binary)} 退出码 ${code}：${Buffer.concat(err).toString().trim()}`));
    });
    child.stdin.end(input);
  });
}

async function compressJpeg(
  data: Buffer,
): Promise<{ data: Buffer; compressor: string; note?: string; stripsMetadata: boolean } | { skip: string }> {
  jpegtranPath ??= findTool("jpegtran");
  const binary = await jpegtranPath;
  if (!binary) return { skip: "没有找到 jpegtran（brew install jpeg-turbo），上传原件" };
  const { orientation = 1 } = await sharp(data).metadata();
  // Keep only the ICC profile: drops EXIF (GPS, camera model) and comments.
  // The DCT data is copied untouched, so the pixels stay identical.
  let output = await runTool(binary, ["-copy", "icc", "-optimize", "-progressive"], data);
  if (orientation !== 1) output = insertJpegSegment(output, orientationExifSegment(orientation));
  return {
    data: output,
    compressor: `jpegtran -copy icc -optimize -progressive${orientation !== 1 ? ` + orientation ${orientation}` : ""}`,
    stripsMetadata: true,
  };
}

// ---------------------------------------------------------------- GIF / SVG

let gifsiclePath: Promise<string | null> | null = null;

async function compressGif(data: Buffer): Promise<{ data: Buffer; compressor: string } | { skip: string }> {
  gifsiclePath ??= findTool("gifsicle");
  const binary = await gifsiclePath;
  if (!binary) return { skip: "没有找到 gifsicle（brew install gifsicle），上传原件" };
  return { data: await runTool(binary, ["-O3", "--no-comments", "--no-names", "--no-extensions"], data), compressor: "gifsicle -O3" };
}

function compressSvg(data: Buffer): { data: Buffer; compressor: string } {
  const result = optimizeSvg(data.toString("utf8"), {
    multipass: true,
    plugins: [{ name: "preset-default", params: { overrides: { cleanupIds: false } } }],
  });
  return { data: Buffer.from(result.data, "utf8"), compressor: "svgo preset-default" };
}

// ---------------------------------------------------------------- verification

async function decode(data: Buffer): Promise<{ pixels: Buffer; width: number; height: number }> {
  const { data: pixels, info } = await sharp(data, { animated: true, limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels, width: info.width, height: info.height };
}

export async function samePixels(a: Buffer, b: Buffer): Promise<boolean> {
  const [left, right] = await Promise.all([decode(a), decode(b)]);
  return left.width === right.width && left.height === right.height && left.pixels.equals(right.pixels);
}

// ---------------------------------------------------------------- entry point

export async function compressImage(original: Buffer, extension: string): Promise<CompressResult> {
  const ext = extension.toLowerCase().replace(/^\./, "");
  let candidate: { data: Buffer; compressor: string; note?: string; stripsMetadata?: boolean };
  try {
    if (ext === "png") candidate = await compressPng(original);
    else if (ext === "jpg" || ext === "jpeg") {
      const result = await compressJpeg(original);
      if ("skip" in result) return { data: original, compressor: null, note: result.skip };
      candidate = result;
    } else if (ext === "gif") {
      const result = await compressGif(original);
      if ("skip" in result) return { data: original, compressor: null, note: result.skip };
      candidate = result;
    } else if (ext === "svg") candidate = compressSvg(original);
    else return { data: original, compressor: null, note: `${ext} 不做压缩` };
  } catch (error) {
    return { data: original, compressor: null, note: `压缩失败，上传原件：${(error as Error).message}` };
  }

  // A metadata-stripping result is kept even when it is not smaller, so
  // EXIF/GPS never reaches the image host; otherwise it must shrink.
  const keepForPrivacy = candidate.stripsMetadata && candidate.data.length <= original.length * 1.05;
  if (candidate.data.length >= original.length && !keepForPrivacy) {
    return { data: original, compressor: null, note: "压缩后没有变小，上传原件" };
  }
  try {
    if (!(await samePixels(original, candidate.data))) {
      return { data: original, compressor: null, note: "压缩结果和原图像素不一致，上传原件" };
    }
  } catch (error) {
    return { data: original, compressor: null, note: `无法校验压缩结果，上传原件：${(error as Error).message}` };
  }
  return { data: candidate.data, compressor: candidate.compressor, note: candidate.note };
}

/** Pixel size after EXIF orientation, used for width/height attributes. */
export async function displaySize(data: Buffer): Promise<{ width?: number; height?: number }> {
  const meta = await sharp(data, { limitInputPixels: false }).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  // For animated images sharp reports the stacked height; use one page.
  const pageHeight = meta.pageHeight && meta.pages && meta.pages > 1 ? meta.pageHeight : height;
  return { width, height: pageHeight };
}
