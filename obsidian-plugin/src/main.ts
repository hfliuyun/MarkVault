import JSZip from "jszip";
import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  TFile,
  TFolder,
} from "obsidian";

interface MarkVaultSettings {
  serverUrl: string;
  deviceToken: string;
  autoPublish: boolean;
  debounceMinutes: number;
}

const DEFAULT_SETTINGS: MarkVaultSettings = {
  serverUrl: "",
  deviceToken: "",
  autoPublish: false,
  debounceMinutes: 3,
};

interface PublishStateEntry {
  slug: string;
  hash: string;
}

type PublishState = Record<string, PublishStateEntry>;

interface PluginData {
  settings: MarkVaultSettings;
  publishState: PublishState;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** requestUrl.json throws on non-JSON bodies (e.g. HTML 404 pages). */
function safeJson(response: { json: unknown }): Record<string, unknown> | null {
  try {
    const parsed = response.json;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export default class MarkVaultPlugin extends Plugin {
  settings: MarkVaultSettings = DEFAULT_SETTINGS;
  publishState: PublishState = {};
  private autoPublishTimers = new Map<string, number>();

  async onload(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginData> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    this.publishState = data?.publishState ?? {};

    this.addSettingTab(new MarkVaultSettingTab(this.app, this));

    this.addRibbonIcon("upload", "发布当前文章到 MarkVault", () => {
      void this.publishActiveNote();
    });

    this.addCommand({
      id: "markvault-login",
      name: "登录 MarkVault（获取设备令牌）",
      callback: () => {
        this.openLoginModal();
      },
    });

    this.addCommand({
      id: "markvault-publish-current",
      name: "发布当前文章",
      callback: () => {
        void this.publishActiveNote();
      },
    });

    this.addCommand({
      id: "markvault-pull-current",
      name: "从服务器拉取当前文章",
      callback: () => {
        void this.pullActiveNote();
      },
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          this.scheduleAutoPublish(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && this.publishState[file.path]) {
          delete this.publishState[file.path];
          void this.saveSettings();
        }
      })
    );
  }

  onunload(): void {
    for (const timer of this.autoPublishTimers.values()) {
      window.clearTimeout(timer);
    }
    this.autoPublishTimers.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      publishState: this.publishState,
    });
  }

  /** Notes carrying a frontmatter slug are treated as blog posts. */
  frontmatterSlug(file: TFile): string | null {
    if (file.extension !== "md") return null;
    const cache = this.app.metadataCache.getFileCache(file);
    const slug = cache?.frontmatter?.slug;
    if (typeof slug !== "string" || !slug.trim()) return null;
    return slug.trim();
  }

  private scheduleAutoPublish(file: TFile): void {
    if (!this.settings.autoPublish) return;
    if (!this.frontmatterSlug(file)) return;
    if (!this.settings.deviceToken) return;

    const existing = this.autoPublishTimers.get(file.path);
    if (existing) window.clearTimeout(existing);

    const delay = Math.max(1, this.settings.debounceMinutes) * 60 * 1000;
    const timer = window.setTimeout(() => {
      this.autoPublishTimers.delete(file.path);
      void this.publishNote(file, { manual: false });
    }, delay);
    this.autoPublishTimers.set(file.path, timer);
  }

  private async publishActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("没有打开的笔记");
      return;
    }
    await this.publishNote(file, { manual: true });
  }

  private async publishNote(
    file: TFile,
    options: { manual: boolean }
  ): Promise<void> {
    const slug = this.frontmatterSlug(file);
    if (!slug) {
      if (options.manual) {
        new Notice("该笔记没有 frontmatter slug，跳过发布");
      }
      return;
    }

    if (!this.settings.serverUrl) {
      if (options.manual) new Notice("请先在插件设置里填写服务器地址");
      return;
    }

    const previous = this.publishState[file.path];
    const hash = await this.computePostHash(file);
    if (previous && previous.hash === hash) {
      if (options.manual) new Notice("内容未变化，无需发布");
      return;
    }

    if (!this.settings.deviceToken) {
      if (!options.manual) return;
      await this.openLoginModal();
      if (!this.settings.deviceToken) return;
    }

    const overwrite = Boolean(previous);
    const published = await this.uploadPost(file, slug, hash, overwrite, options);
    if (published) {
      this.publishState[file.path] = { slug, hash };
      await this.saveSettings();
    }
  }

  private async computePostHash(note: TFile): Promise<string> {
    const content = await this.app.vault.cachedRead(note);
    const parts = [content];
    for (const image of this.collectImageFiles(note)) {
      parts.push(`${image.path}:${image.stat.size}:${image.stat.mtime}`);
    }
    return sha256Hex(parts.join("\n"));
  }

  /** images/ folder (including subfolders) next to the note. */
  private collectImageFiles(note: TFile): TFile[] {
    const parentPath = note.parent?.path ?? "/";
    const imagesRoot = this.app.vault.getAbstractFileByPath(
      `${parentPath}/images`
    );
    const files: TFile[] = [];
    if (imagesRoot instanceof TFolder) {
      this.walkFolder(imagesRoot, files);
    }
    return files;
  }

  private walkFolder(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        this.walkFolder(child, files);
      } else if (child instanceof TFile) {
        files.push(child);
      }
    }
  }

  private async buildPostZip(note: TFile, slug: string): Promise<ArrayBuffer> {
    const parentPath = note.parent?.path ?? "/";
    const zip = new JSZip();
    zip.file(`${slug}/${note.name}`, await this.app.vault.readBinary(note));
    for (const image of this.collectImageFiles(note)) {
      const relativePath = image.path.slice(parentPath.length + 1);
      zip.file(`${slug}/${relativePath}`, await this.app.vault.readBinary(image));
    }
    return zip.generateAsync({ type: "arraybuffer" });
  }

  /** Returns true when the note is published (or unchanged) on the server. */
  private async uploadPost(
    note: TFile,
    slug: string,
    hash: string,
    overwrite: boolean,
    options: { manual: boolean }
  ): Promise<boolean> {
    try {
      return await this.uploadPostOnce(note, slug, hash, overwrite, options);
    } catch (error) {
      if (options.manual) {
        new Notice(`发布失败：${(error as Error).message}`);
      }
      return false;
    }
  }

  private async uploadPostOnce(
    note: TFile,
    slug: string,
    hash: string,
    overwrite: boolean,
    options: { manual: boolean }
  ): Promise<boolean> {
    const zipBody = await this.buildPostZip(note, slug);
    const response = await requestUrl({
      url: `${this.settings.serverUrl}/api/posts/upload?overwrite=${overwrite}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.deviceToken}`,
        "Content-Type": "application/zip",
      },
      body: zipBody,
      throw: false,
    });

    if (response.status === 201) {
      const published = safeJson(response);
      new Notice(`已发布：${String(published?.path ?? slug)}`);
      return true;
    }

    if (response.status === 401) {
      this.settings.deviceToken = "";
      await this.saveSettings();
      if (options.manual) {
        const retried = await this.openLoginModal();
        if (retried) {
          return this.uploadPostOnce(note, slug, hash, overwrite, options);
        }
      } else {
        new Notice("MarkVault 设备令牌已过期，请手动重新登录");
      }
      return false;
    }

    if (response.status === 404) {
      if (options.manual) {
        new Notice("接口不存在（HTTP 404）：服务器后端可能未部署最新版本");
      }
      return false;
    }

    if (response.status === 409) {
      if (!options.manual) {
        new Notice(`slug "${slug}" 在服务器上已存在其他文章，请手动发布确认覆盖`);
        return false;
      }
      const body = safeJson(response);
      const serverMessage = String(body?.error ?? "该 slug 已存在");
      const overwriteNow = await new Promise<boolean>((resolve) => {
        new ConfirmModal(
          this.app,
          "覆盖已有文章",
          serverMessage,
          () => resolve(true),
          () => resolve(false)
        ).open();
      });
      if (overwriteNow) {
        return this.uploadPostOnce(note, slug, hash, true, options);
      }
      return false;
    }

    const body = safeJson(response);
    const message = String(body?.error ?? `HTTP ${response.status}`);
    if (options.manual) new Notice(`发布失败：${message}`);
    return false;
  }

  /** Opens the TOTP login modal; resolves true when a token was obtained. */
  openLoginModal(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      new LoginModal(this.app, this, resolve).open();
    });
  }

  private async pullActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("没有打开的笔记");
      return;
    }
    await this.pullNote(file);
  }

  /** Pull the server copy of a note back into the vault. The web editor
   * writes to the server only; this closes the loop for emergency fixes. */
  private async pullNote(file: TFile): Promise<void> {
    const slug = this.frontmatterSlug(file);
    if (!slug) {
      new Notice("该笔记没有 frontmatter slug");
      return;
    }
    if (!this.settings.serverUrl) {
      new Notice("请先在插件设置里填写服务器地址");
      return;
    }
    if (!this.settings.deviceToken) {
      const loggedIn = await this.openLoginModal();
      if (!loggedIn) return;
    }

    const raw = await this.fetchPostRaw(slug);
    if (raw === null) return;

    const localContent = await this.app.vault.read(file);
    if (localContent === raw) {
      new Notice("本地与服务器一致");
      return;
    }

    const overwrite = await new Promise<boolean>((resolve) => {
      new ConfirmModal(
        this.app,
        "拉取服务器版本",
        `服务器上的「${slug}」与本地不同，本地笔记将被服务器版本覆盖（图片不受影响）。`,
        () => resolve(true),
        () => resolve(false)
      ).open();
    });
    if (!overwrite) return;

    await this.app.vault.modify(file, raw);
    // Update the recorded hash so auto-publish does not echo the pulled
    // content straight back to the server.
    this.publishState[file.path] = { slug, hash: await this.computePostHash(file) };
    await this.saveSettings();
    new Notice("已拉取服务器版本到本地");
  }

  private async fetchPostRaw(slug: string): Promise<string | null> {
    try {
      return await this.fetchPostRawOnce(slug);
    } catch (error) {
      new Notice(`拉取失败：${(error as Error).message}`);
      return null;
    }
  }

  private async fetchPostRawOnce(slug: string): Promise<string | null> {
    const response = await requestUrl({
      url: `${this.settings.serverUrl}/api/manage/posts/${encodeURIComponent(slug)}/raw`,
      method: "GET",
      headers: { Authorization: `Bearer ${this.settings.deviceToken}` },
      throw: false,
    });

    if (response.status === 200) {
      const body = safeJson(response);
      if (typeof body?.raw === "string") return body.raw;
      new Notice("拉取失败：响应格式异常");
      return null;
    }

    if (response.status === 401) {
      this.settings.deviceToken = "";
      await this.saveSettings();
      const retried = await this.openLoginModal();
      if (retried) return this.fetchPostRawOnce(slug);
      return null;
    }

    if (response.status === 404) {
      new Notice("文章不存在（或服务器后端未部署最新版本）");
      return null;
    }

    const body = safeJson(response);
    new Notice(`拉取失败：${String(body?.error ?? `HTTP ${response.status}`)}`);
    return null;
  }
}

class LoginModal extends Modal {
  private errorEl: HTMLElement | null = null;
  private submitted = false;

  constructor(
    app: App,
    private plugin: MarkVaultPlugin,
    private onDone: (loggedIn: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("登录 MarkVault");
    this.contentEl.createEl("p", {
      text: "输入 Authenticator 的 6 位动态验证码，换取 30 天有效期的设备令牌。",
    });

    const input = this.contentEl.createEl("input", {
      type: "text",
      placeholder: "6 位动态验证码",
    });
    input.style.width = "100%";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        void this.submit(input.value);
      }
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("验证")
          .setCta()
          .onClick(() => void this.submit(input.value))
      )
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.close())
      );

    this.errorEl = this.contentEl.createEl("p", { text: "" });
    this.errorEl.style.color = "#d14343";
    window.setTimeout(() => input.focus());
  }

  private setError(message: string): void {
    if (this.errorEl) this.errorEl.setText(message);
  }

  private async submit(rawCode: string): Promise<void> {
    if (this.submitted) return;
    const code = rawCode.trim();
    if (!/^\d{6}$/.test(code)) {
      this.setError("请输入 6 位数字验证码");
      return;
    }
    if (!this.plugin.settings.serverUrl) {
      this.setError("请先在插件设置里填写服务器地址");
      return;
    }
    if (!/^https?:\/\//i.test(this.plugin.settings.serverUrl)) {
      this.setError("服务器地址需要以 https:// 开头");
      return;
    }

    this.submitted = true;
    try {
      const response = await requestUrl({
        url: `${this.plugin.settings.serverUrl}/api/auth/device_token`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        throw: false,
      });
      const body = safeJson(response);
      if (response.status === 200 && typeof body?.token === "string") {
        this.plugin.settings.deviceToken = body.token;
        await this.plugin.saveSettings();
        new Notice("登录成功，设备令牌有效期 30 天");
        this.close();
        this.onDone(true);
        return;
      }
      if (response.status === 404) {
        this.setError("接口不存在（HTTP 404）：服务器后端可能未部署最新版本");
        return;
      }
      this.setError(String(body?.error ?? `验证失败（HTTP ${response.status}）`));
    } catch (error) {
      this.setError("无法连接服务器：请检查网络与服务器地址（需以 https:// 开头）");
    } finally {
      this.submitted = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.submitted) this.onDone(false);
  }
}

class ConfirmModal extends Modal {
  constructor(
    app: App,
    title: string,
    message: string,
    private onConfirm: () => void,
    private onCancel: () => void
  ) {
    super(app);
    this.titleEl.setText(title);
    this.message = message;
  }

  private message: string;

  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("覆盖发布")
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          })
      )
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => {
          this.close();
          this.onCancel();
        })
      );
  }

  onClose(): void {
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
    containerEl.createEl("h2", { text: "MarkVault Publisher" });

    new Setting(containerEl)
      .setName("服务器地址")
      .setDesc("MarkVault 后端地址，需以 https:// 开头")
      .addText((text) =>
        text
          .setPlaceholder("https://blog.example.com")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("设备令牌")
      .setDesc(
        this.plugin.settings.deviceToken
          ? "已保存（有效期 30 天，过期后重新登录即可）"
          : "未登录，点击右侧按钮输入验证码登录"
      )
      .addExtraButton((button) =>
        button.setIcon("key").setTooltip("登录").onClick(() => {
          this.plugin.openLoginModal();
        })
      )
      .addExtraButton((button) =>
        button.setIcon("trash").setTooltip("清除令牌").onClick(async () => {
          this.plugin.settings.deviceToken = "";
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("自动发布")
      .setDesc("笔记修改后按下方延迟自动发布（仅限带 frontmatter slug 的笔记）")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoPublish)
          .onChange(async (value) => {
            this.plugin.settings.autoPublish = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自动发布延迟（分钟）")
      .setDesc("停止修改后等待多少分钟再发布，避免写作过程中频繁上传")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.debounceMinutes))
          .onChange(async (value) => {
            const minutes = Number.parseInt(value, 10);
            if (!Number.isNaN(minutes) && minutes >= 1 && minutes <= 60) {
              this.plugin.settings.debounceMinutes = minutes;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}
