import { spawn } from "child_process";
import { existsSync } from "fs";
import * as path from "path";
import {
  App,
  FileSystemAdapter,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";

/**
 * Thin front end for the `markvault` CLI (design doc 5.5). All publishing
 * logic lives in the CLI so it also works without Obsidian; this plugin only
 * picks the note, asks for a slug when needed and shows the CLI output.
 */

interface MarkVaultSettings {
  /** Path of the MarkVault code repository (contains packages/cli). */
  repoPath: string;
  /** Node.js binary; GUI apps on macOS do not inherit the shell PATH. */
  nodePath: string;
  /** Optional HTTP proxy for git push / wrangler, e.g. http://127.0.0.1:10808 */
  proxy: string;
  /** Public site address used for "open article" links. */
  siteUrl: string;
}

const DEFAULT_SETTINGS: MarkVaultSettings = {
  repoPath: "",
  nodePath: "",
  proxy: "",
  siteUrl: "",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NODE_CANDIDATES = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"];
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

function suggestSlug(title: string): string {
  return (title.toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-").slice(0, 60).replace(/-+$/, "");
}

interface RunResult {
  code: number;
  output: string;
}

export default class MarkVaultPlugin extends Plugin {
  settings: MarkVaultSettings = DEFAULT_SETTINGS;
  private running = false;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as { settings?: Partial<MarkVaultSettings> } | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    this.addSettingTab(new MarkVaultSettingTab(this.app, this));

    this.addRibbonIcon("upload", "发布当前笔记到 MarkVault", () => void this.publishActive());
    this.addCommand({ id: "publish-current", name: "发布当前笔记", callback: () => void this.publishActive() });
    this.addCommand({ id: "publish-all", name: "重新发布整个站点（不修改笔记）", callback: () => void this.publishAll() });
    this.addCommand({ id: "check", name: "检查全部内容", callback: () => void this.check() });
    this.addCommand({ id: "unpublish-current", name: "取消发布当前笔记", callback: () => void this.unpublishActive() });
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ settings: this.settings });
  }

  private vaultRoot(): string | null {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  }

  private nodeBinary(): string {
    if (this.settings.nodePath) return this.settings.nodePath;
    return NODE_CANDIDATES.find((candidate) => existsSync(candidate)) ?? "node";
  }

  private cliEntry(): string | null {
    if (!this.settings.repoPath) return null;
    const entry = path.join(this.settings.repoPath, "packages", "cli", "src", "main.ts");
    return existsSync(entry) ? entry : null;
  }

  private activeNote(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("请先打开一篇 Markdown 笔记");
      return null;
    }
    return file;
  }

  /** Run the CLI, streaming output into a log window. */
  private async run(title: string, args: string[]): Promise<RunResult | null> {
    if (this.running) {
      new Notice("MarkVault 正在运行，请等它结束");
      return null;
    }
    const entry = this.cliEntry();
    const vault = this.vaultRoot();
    if (!entry || !vault) {
      new Notice("请先在插件设置里填写 MarkVault 仓库路径");
      return null;
    }

    // Make sure the editor buffer is on disk before the CLI reads it.
    await this.app.workspace.getActiveViewOfType(MarkdownView)?.save();

    const node = this.nodeBinary();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: [path.dirname(node), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH ?? ""].join(":"),
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    };
    if (this.settings.proxy) {
      Object.assign(env, {
        HTTP_PROXY: this.settings.proxy,
        HTTPS_PROXY: this.settings.proxy,
        http_proxy: this.settings.proxy,
        https_proxy: this.settings.proxy,
        NODE_USE_ENV_PROXY: "1",
      });
    }

    const modal = new LogModal(this.app, title);
    modal.open();
    this.running = true;
    try {
      return await new Promise<RunResult>((resolve) => {
        let output = "";
        const child = spawn(node, [entry, ...args, "--vault", vault], { cwd: this.settings.repoPath, env });
        const onData = (chunk: Buffer) => {
          const text = chunk.toString("utf8").replace(ANSI, "");
          output += text;
          modal.append(text);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (error) => {
          modal.append(`\n无法启动 ${node}：${error.message}\n请在插件设置里填写 Node 路径。\n`);
          modal.finish(false);
          resolve({ code: -1, output });
        });
        child.on("close", (code) => {
          modal.finish(code === 0);
          resolve({ code: code ?? -1, output });
        });
      });
    } finally {
      this.running = false;
    }
  }

  private async publishActive(): Promise<void> {
    const file = this.activeNote();
    if (!file) return;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    let slug = typeof frontmatter.slug === "string" ? frontmatter.slug.trim() : "";
    const args = ["publish", file.path];
    if (!slug) {
      const title = typeof frontmatter.title === "string" ? frontmatter.title : file.basename;
      const chosen = await new SlugModal(this.app, title, suggestSlug(title)).ask();
      if (!chosen) return;
      slug = chosen;
      args.push("--slug", slug);
    }
    const result = await this.run(`发布：${file.basename}`, args);
    if (result?.code === 0) {
      const link = this.settings.siteUrl ? `${this.settings.siteUrl.replace(/\/$/, "")}/posts/${slug}/` : "";
      new Notice(link ? `已发布：${link}` : "已发布", 8000);
    }
  }

  private async publishAll(): Promise<void> {
    const result = await this.run("重新发布整个站点", ["publish"]);
    if (result?.code === 0) new Notice("已发布");
  }

  private async check(): Promise<void> {
    await this.run("检查全部内容", ["check"]);
  }

  private async unpublishActive(): Promise<void> {
    const file = this.activeNote();
    if (!file) return;
    const confirmed = await new ConfirmModal(
      this.app,
      "取消发布",
      `「${file.basename}」会从网站上下线（笔记本身不会删除）。继续？`,
    ).ask();
    if (!confirmed) return;
    const result = await this.run(`取消发布：${file.basename}`, ["unpublish", file.path]);
    if (result?.code === 0) new Notice("已下线");
  }
}

class LogModal extends Modal {
  private pre!: HTMLPreElement;
  private status!: HTMLElement;

  constructor(app: App, private heading: string) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.status = this.contentEl.createEl("p", { text: "运行中…" });
    this.pre = this.contentEl.createEl("pre");
    Object.assign(this.pre.style, {
      maxHeight: "50vh",
      overflow: "auto",
      fontSize: "12px",
      whiteSpace: "pre-wrap",
      userSelect: "text",
    });
  }

  append(text: string): void {
    if (!this.pre) return;
    this.pre.appendText(text);
    this.pre.scrollTop = this.pre.scrollHeight;
  }

  finish(ok: boolean): void {
    if (!this.status) return;
    this.status.setText(ok ? "✓ 完成" : "✗ 失败，详情见下面的输出");
    this.status.style.color = ok ? "var(--color-green)" : "var(--color-red)";
  }
}

class SlugModal extends Modal {
  private resolve: (value: string | null) => void = () => {};
  private settled = false;

  constructor(app: App, private title: string, private suggestion: string) {
    super(app);
  }

  ask(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.titleEl.setText("这篇笔记第一次发布，需要一个 slug");
    this.contentEl.createEl("p", { text: `「${this.title}」的网址会是 /posts/<slug>/，发布后不要再改。` });
    const input = this.contentEl.createEl("input", { type: "text", value: this.suggestion, placeholder: "例如 aac-stream" });
    input.style.width = "100%";
    const error = this.contentEl.createEl("p", { text: "" });
    error.style.color = "var(--color-red)";
    const submit = () => {
      const value = input.value.trim();
      if (!SLUG_PATTERN.test(value)) {
        error.setText("只能用小写字母、数字和单个连字符");
        return;
      }
      this.settle(value);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("发布").setCta().onClick(submit))
      .addButton((button) => button.setButtonText("取消").onClick(() => this.settle(null)));
    window.setTimeout(() => input.focus());
  }

  private settle(value: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }

  onClose(): void {
    this.settle(null);
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  private resolve: (value: boolean) => void = () => {};
  private settled = false;

  constructor(app: App, private heading: string, private message: string) {
    super(app);
  }

  ask(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("继续").setWarning().onClick(() => this.settle(true)))
      .addButton((button) => button.setButtonText("取消").onClick(() => this.settle(false)));
  }

  private settle(value: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }

  onClose(): void {
    this.settle(false);
    this.contentEl.empty();
  }
}

class MarkVaultSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MarkVaultPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "插件只是调用 markvault 命令行工具。Cloudinary 和 Cloudflare 的凭据由 scripts/setup.sh 配置在本机，不保存在这里。",
    });

    const text = (name: string, desc: string, key: keyof MarkVaultSettings, placeholder: string) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((input) =>
          input
            .setPlaceholder(placeholder)
            .setValue(this.plugin.settings[key])
            .onChange(async (value) => {
              this.plugin.settings[key] = value.trim();
              await this.plugin.saveSettings();
            }),
        );

    text("MarkVault 仓库路径", "代码仓库的绝对路径（里面有 packages/cli）", "repoPath", "/Users/you/code/MarkVault");
    text("Node 路径", "留空时自动查找 /opt/homebrew/bin/node、/usr/local/bin/node", "nodePath", "/opt/homebrew/bin/node");
    text("代理（可选）", "git push 和部署需要代理时填写", "proxy", "http://127.0.0.1:10808");
    text("站点地址（可选）", "发布后用来显示文章链接", "siteUrl", "https://blog.example.com");
  }
}
