export type DiagnosticLevel = "error" | "warning";

export interface Diagnostic {
  level: DiagnosticLevel;
  /** Vault-relative path (POSIX separators). */
  file: string;
  line?: number;
  message: string;
}

/** Any Markdown file found in the vault, published or not. */
export interface NoteFile {
  /** Vault-relative POSIX path, e.g. "音视频/音频流基础.md". */
  path: string;
  /** File name without extension. */
  stem: string;
  /** Parsed frontmatter, or null when the note has none. */
  frontmatter: Record<string, unknown> | null;
  /** Raw frontmatter YAML text, or null when the note has none. */
  frontmatterText: string | null;
  /** Frontmatter parse error, if any. */
  frontmatterError?: string;
  body: string;
  /** 1-based line number where the body starts in the file. */
  bodyStartLine: number;
}

export interface ImageRef {
  /** Raw target as written, e.g. "a.png" or "images/a.png". */
  target: string;
  /** Resolved vault-relative path, when the local file exists. */
  resolvedPath?: string;
  /** Content hash key used for /img/<hash>.<ext>. */
  hash?: string;
  width?: number;
  height?: number;
  raw: boolean;
  alt: string;
  line?: number;
}

export interface NoteLink {
  target: string;
  /** Heading part after "#", if any. */
  heading?: string;
  /** Resolved vault-relative path of the linked note. */
  resolvedPath?: string;
  embed: boolean;
  line?: number;
}

export interface SeriesRef {
  /** Vault-relative path of the series note. */
  path: string;
  order?: number;
}

export interface Post {
  kind: "post";
  path: string;
  slug: string;
  title: string;
  /** ISO 8601 with offset. */
  date: string;
  updated?: string;
  summary: string;
  categories: string[];
  tags: string[];
  series?: SeriesRef;
  redirectFrom: string[];
  legacyAbbrlinks: string[];
  extra: Record<string, unknown>;
  body: string;
  bodyStartLine: number;
  images: ImageRef[];
  links: NoteLink[];
}

export interface Series {
  kind: "series";
  path: string;
  slug: string;
  title: string;
  body: string;
  bodyStartLine: number;
  images: ImageRef[];
  links: NoteLink[];
  /** Filled after all posts are loaded, ordered for display. */
  posts: Post[];
}

export interface ImageAsset {
  sha256: string;
  public_id: string;
  format: string;
  width?: number;
  height?: number;
  bytes_original?: number;
  bytes_uploaded?: number;
  compressor?: string | null;
  uploaded_at?: string;
}

export interface ImageManifest {
  version: 1;
  paths: Record<string, string>;
  assets: Record<string, ImageAsset>;
}

export interface VaultModel {
  root: string;
  notes: NoteFile[];
  posts: Post[];
  series: Series[];
  postsBySlug: Map<string, Post>;
  seriesBySlug: Map<string, Series>;
  /** abbrlink -> slug */
  legacyRedirects: Map<string, string>;
  /** old slug -> current slug */
  slugRedirects: Map<string, string>;
  /** Local images referenced by published notes that are not uploaded yet. */
  pendingImages: Map<string, string>;
  manifest: ImageManifest;
}

export interface LoadResult {
  model: VaultModel;
  diagnostics: Diagnostic[];
}
