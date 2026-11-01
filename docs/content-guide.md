# MarkVault 写作指南

文章就是 Obsidian vault 里的普通笔记。本文说明哪些笔记会发布、frontmatter 怎么写、支持哪些语法，以及怎么发布。规则的完整说明见[迁移设计](specs/2026-11-01-cloudflare-migration-design.md)第 3、4 节。

## vault 结构

目录结构由你决定。构建会扫描整个 vault，只收录 frontmatter 里写了 `publish: true` 的笔记。文件名和所在目录都不影响 URL，可以随便重命名、移动。

不扫描的目录：`.obsidian`、`.markvault`、`.git`、`.stfolder`、`.trash`、`.tmp.driveupload`、`node_modules`，以及配置文件 `ignore` 里列出的目录（相对 vault 根目录，比如模板目录）。

一种可行的结构：

```
blog-content/
├── 音视频数据流基础/
│   ├── 音视频数据流基础.md       ← 系列笔记（type: series）
│   ├── 音频流基础：PCM、WAV 与 AAC.md
│   └── images/
├── 独立文章/
│   ├── 逻辑回归.md
│   └── images/
├── 日记/                         ← 没有 publish: true，不会发布
└── .markvault/                   ← 工具维护，跟 Markdown 一起提交
    ├── images.json
    └── published.json
```

## 文章 frontmatter

```yaml
---
publish: true                      # 必填。不写或为 false 就不发布
slug: aac-stream                   # 必填。第一次 publish 时工具会帮你填，之后不要改
date: 2026-06-30 23:29             # 必填。第一次 publish 时自动填当前时间
updated: 2026-07-02                # 可选。显示"最后更新"
title: 音频流基础：PCM、WAV 与 AAC  # 可选。不写就用文件名
summary: 从音频采集全链路出发……      # 可选
categories: [音视频流基础]           # 可选
tags: [AAC, PCM, ADTS, WAV]         # 可选
series: "[[音视频数据流基础]]"        # 可选。指向一篇系列笔记
series_order: 2                    # 可选。系列内的排序
redirect_from: [old-slug]          # 可选。改过 slug 时让旧地址继续能访问
legacy:
  abbrlinks: [a1b2c3d4]            # 可选。旧博客 /p/<abbrlink> 链接
---
```

- `slug` 只能用小写字母、数字和单个连字符，并且在所有文章和系列之间唯一。URL 是 `/posts/<slug>/`。
- `date` 可以写 `YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、`YYYY-MM-DD HH:mm:ss` 或 ISO 8601。没写时区的按 `Asia/Shanghai` 处理。
- Obsidian 自带的 `aliases`、`cssclasses` 可以保留。其他未知字段只给警告。
- frontmatter 必须从文件第一行开始，前面有空行就不会被识别。

## 系列

系列也是一篇笔记，用 `type: series` 标记，正文就是系列简介：

```yaml
---
publish: true
type: series
slug: av-stream-basics             # 系列 id，URL 是 /series/av-stream-basics/
title: 音视频数据流基础              # 可选。不写就用文件名
---
整个音视频的开发流程经历下面几步……
```

文章用 `series: "[[音视频数据流基础]]"` 指向它。系列内先按 `series_order` 升序，没写 `series_order` 的排在后面，再按 `date` 排。

## 支持的语法

| 语法 | 处理方式 |
|---|---|
| CommonMark + GFM（表格、任务列表、删除线、脚注） | 支持 |
| `$...$`、`$$...$$` | 构建时用 KaTeX 渲染 |
| 代码块 | 构建时用 Shiki 高亮，浅色和深色主题各一套 |
| ` ```mermaid ` | 只在有图的页面加载 mermaid |
| `[[笔记]]`、`[[笔记\|文字]]`、`[[笔记#标题]]` | 指向已发布的笔记时生成站内链接，否则只输出文字并警告 |
| `![[图片.png]]`、`![](images/图片.png)` | 换成 `/img/<hash>.webp` |
| `![[图片.png\|300]]`、`![[图片.png\|raw]]` | `300` 是显示宽度；`raw` 表示不转 WebP，用原图 |
| `> [!note] 标题`、`> [!tip]-` | callout，带 `-` 或 `+` 的可以折叠 |
| `==高亮==` | `<mark>` |
| `%%注释%%`、`^block-id` | 删除 |
| `![[另一篇笔记]]` | 不支持嵌入，降级为链接并警告 |
| 原始 HTML | 允许，但会经过白名单过滤 |

中文标点紧挨 `**` 的写法（`**“编码”**决定`）也能正确加粗。图片路径里不能有未编码的空格：写成 `%20`，或者改用 `![[...]]`。

## 图片

- 图片原件放在 vault 里，Markdown 里写本地引用即可，不用关心线上地址。
- `publish` 时，新图片先无损压缩（逐像素比对），再上传到 Cloudinary，`images.json` 记录 hash 和尺寸。hash 基于原件，所以压缩工具升级不会让图片地址变化。
- 图片原件不进 Git，需要自己备份。`images.json` 会提交，所以只有 Markdown 和 `images.json` 的电脑也能构建，不需要原件。

## 校验

`markvault check` 和每次构建执行同一套校验。只要有一项报错，构建就失败，线上继续使用上一个版本。

报错：必填字段缺失或格式不对、slug 重复（包括和系列、`redirect_from` 重复）、`series` 指向的笔记不存在或不是系列、图片既不在本地也不在 `images.json` 里、同一个 abbrlink 指向两篇文章、图片路径有空格、frontmatter 无法解析。

警告：wikilink 指向未发布的笔记、未知字段、之前发布过的 slug 这次不见了而且没写进 `redirect_from`（URL 会变成 404）、frontmatter 前有空行。

## 发布

```sh
npm run markvault -- publish 独立文章/逻辑回归.md   # 发布一篇新笔记
npm run markvault -- publish                      # 只是重新发布全部内容
npm run markvault -- unpublish 独立文章/逻辑回归.md
```

指定笔记时，工具会写入 `publish: true`，没有 `slug` 时让你确认一个（`--slug` 可以直接给出），没有 `date` 时写入当前时间。然后依次校验、上传新图片、构建、部署，最后提交并推送 vault（`--no-git` 跳过这一步，推送失败只给警告）。

在 Obsidian 里可以用插件的「发布当前笔记」「检查」「取消发布当前笔记」命令，效果相同。
