/**
 * Heading id rule carried over from the Flask renderer (slugify_heading),
 * so in-page anchors keep the same shape: lowercase, whitespace to "-",
 * keep a-z, 0-9, "-" and CJK ideographs.
 */
export function slugifyHeading(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-\u4e00-\u9fff]/g, "");
  return slug || "section";
}

/** Returns unique ids: "x", "x-2", "x-3", ... */
export class HeadingIds {
  private readonly used = new Map<string, number>();

  next(title: string): string {
    const base = slugifyHeading(title);
    const count = this.used.get(base) ?? 0;
    this.used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  }
}
