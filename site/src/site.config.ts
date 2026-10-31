/** Site-wide text. Edit freely; nothing else depends on these values. */
export const SITE = {
  title: "MarkVault",
  description: "记录音视频、机器学习和折腾博客的过程。",
  /** Home page heading and one-line intro. */
  intro: {
    heading: "写给未来的自己",
    text: "记录音视频、机器学习和折腾博客的过程。",
  },
  footer: "用 Obsidian 写作 · 部署在 Cloudflare",
  postsPerPage: 10,
};

export const NAV = [
  { href: "/", label: "文章", key: "home" },
  { href: "/series/", label: "系列", key: "series" },
  { href: "/categories/", label: "分类", key: "categories" },
  { href: "/tags/", label: "标签", key: "tags" },
  { href: "/about/", label: "关于", key: "about" },
] as const;

export type NavKey = (typeof NAV)[number]["key"] | "search" | "paste" | "none";
