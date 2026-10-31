import path from "node:path";
import {
  loadVault,
  postUrl,
  renderNote,
  seriesUrl,
  type Diagnostic,
  type Post,
  type RenderedNote,
  type Series,
  type VaultModel,
} from "@markvault/content";

/**
 * One loaded vault per process. The dev integration bumps `version` when a
 * vault file changes; the next request reloads. globalThis is shared between
 * the integration and Vite's SSR module graph.
 */
interface VaultState {
  version: number;
  loadedVersion?: number;
  model?: Promise<VaultModel>;
  rendered: Map<string, Promise<RenderedNote>>;
}

const state: VaultState = ((globalThis as Record<string, unknown>).__markvault as VaultState) ?? {
  version: 0,
  rendered: new Map(),
};
(globalThis as Record<string, unknown>).__markvault = state;

export function vaultRoot(): string {
  return path.resolve(process.env.MARKVAULT_VAULT ?? path.join(process.cwd(), "..", "content"));
}

function formatErrors(diagnostics: Diagnostic[]): string {
  return diagnostics
    .filter((item) => item.level === "error")
    .map((item) => `  ${item.file}${item.line ? `:${item.line}` : ""}  ${item.message}`)
    .join("\n");
}

export function getVault(): Promise<VaultModel> {
  if (!state.model || state.loadedVersion !== state.version) {
    state.loadedVersion = state.version;
    state.rendered = new Map();
    state.model = loadVault(vaultRoot(), {
      requireUploaded: process.env.MARKVAULT_REQUIRE_UPLOADED === "1",
    }).then(({ model, diagnostics }) => {
      const errors = formatErrors(diagnostics);
      if (errors) throw new Error(`vault 校验失败，先运行 markvault check：\n${errors}`);
      return model;
    });
  }
  return state.model;
}

export async function render(item: Post | Series): Promise<RenderedNote> {
  const model = await getVault();
  let rendered = state.rendered.get(item.path);
  if (!rendered) {
    rendered = renderNote(model, item, { imageBase: process.env.MARKVAULT_IMAGE_BASE ?? "/img" });
    state.rendered.set(item.path, rendered);
  }
  return rendered;
}

/** Display date in UTC+8, e.g. "2026-06-30". */
export function formatDate(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function yearOf(iso: string): string {
  return formatDate(iso).slice(0, 4);
}

export function monthDay(iso: string): string {
  return formatDate(iso).slice(5);
}

export function seriesOf(model: VaultModel, post: Post): Series | undefined {
  return post.series ? model.series.find((item) => item.path === post.series?.path) : undefined;
}

/** 1-based position of a post inside its series. */
export function seriesPosition(series: Series, post: Post): number {
  return series.posts.findIndex((item) => item.path === post.path) + 1;
}

export function latestDate(series: Series): string {
  return series.posts.reduce((latest, post) => (post.date > latest ? post.date : latest), "");
}

export function groupByYear(posts: Post[]): [string, Post[]][] {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const year = yearOf(post.date);
    const list = groups.get(year) ?? [];
    list.push(post);
    groups.set(year, list);
  }
  return [...groups];
}

export function taxonomy(posts: Post[], field: "categories" | "tags"): [string, Post[]][] {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    for (const name of post[field]) {
      const list = groups.get(name) ?? [];
      list.push(post);
      groups.set(name, list);
    }
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"));
}

export function categoryUrl(name: string): string {
  return `/categories/${encodeURIComponent(name)}/`;
}

export function tagUrl(name: string): string {
  return `/tags/${encodeURIComponent(name)}/`;
}

export { postUrl, seriesUrl };
