# MarkVault

[简体中文](README.zh-CN.md)

MarkVault is a Markdown-first personal blog. Posts are ordinary notes in an
Obsidian vault. A `markvault` command builds them into a static site on your own
machine and deploys it to Cloudflare Workers (free plan). There is no server to
run.

## How it works

- **Content** lives in the vault, which can be a separate private Git
  repository. Any note with `publish: true` in its frontmatter is published. The
  folder layout does not matter.
- **Pages** are pre-rendered by Astro at build time: posts, series, categories,
  tags, search (Pagefind) and an about page. Code highlighting (Shiki) and math
  (KaTeX) are rendered at build time too.
- **Images** are compressed losslessly and uploaded to Cloudinary on publish. The
  site serves them from `/img/*` through the Worker, which caches them at the edge
  and blocks hotlinking.
- **Paste** is a small cross-device clipboard backed by D1. Devices are trusted
  with a one-year cookie, paired through a QR code or a 6-digit code.
- **Publishing** is one command:
  `markvault publish` validates, uploads new images, builds, deploys and commits
  the vault. The Obsidian plugin calls the same command.

## Repository layout

```text
packages/content/   vault scanning, frontmatter validation, Markdown rendering
packages/cli/       the markvault command
site/               Astro site, Worker (img, Paste API, cron), wrangler.jsonc
obsidian-plugin/    thin plugin that runs markvault publish / check / unpublish
scripts/            setup.sh for a new machine, local test helpers
docs/               architecture, API, content and development guides
```

## Requirements

- Node.js 22.23 or later
- A Cloudflare account (Workers free plan) with a D1 database
- A Cloudinary account for images
- macOS or Linux

## Setup

```sh
git clone https://github.com/hfliuyun/MarkVault.git
cd MarkVault
bash scripts/setup.sh
```

`setup.sh` installs dependencies, asks for the vault path, runs
`wrangler login`, stores the Cloudinary credentials in
`~/.config/markvault/config.json` (mode 600) and finishes with
`markvault check`.

## Usage

```sh
npm run markvault -- check            # validate all content
npm run markvault -- preview          # local preview with live reload
npm run markvault -- publish [note]   # publish everything, or one note
npm run markvault -- unpublish <note> # set publish: false and republish
npm run markvault -- deploy           # build and deploy only (code changes)
npm run markvault -- paste-invite     # one-time link to trust the first device
npm run typecheck
```

## Documentation

- [docs/architecture.md](docs/architecture.md): components and request flow
- [docs/content-guide.md](docs/content-guide.md): vault layout, frontmatter and supported syntax
- [docs/api.md](docs/api.md): Worker routes and the Paste API
- [docs/development-guide.md](docs/development-guide.md): local development and testing
- [docs/changelog.md](docs/changelog.md): notable changes
- [docs/specs/](docs/specs/): design documents, including the
  [Cloudflare migration design](docs/specs/2026-11-01-cloudflare-migration-design.md)

## License

MarkVault is released under the MIT License. See `LICENSE` for details.
