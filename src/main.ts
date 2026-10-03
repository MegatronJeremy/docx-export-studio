import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath, requestUrl } from "obsidian";
import { exportToDocx } from "./exporter";
import { HOW_TO_GET_PRO_URL } from "./config";
import { verifyLicense, type HttpPost } from "./license";
import {
  BUILTIN_PRESETS,
  FreeGate,
  PRO_FEATURE_LABELS,
  UnlockedGate,
  findPreset,
  sanitizePreset,
  type ProGate,
  type StylePreset,
} from "./pro";

interface Settings {
  licenseKey: string;
  /** Result of the last manual check. Pro stays unlocked offline until the user re-checks. */
  proActive: boolean;
  presetId: string;
  customPresets: StylePreset[];
  footnotes: boolean;
  header: string;
  footer: string;
  pageNumbers: boolean;
  batchSubfolders: boolean;
}

const DEFAULTS: Settings = {
  licenseKey: "",
  proActive: false,
  presetId: "default",
  customPresets: [],
  footnotes: true,
  header: "",
  footer: "",
  pageNumbers: true,
  batchSubfolders: false,
};

const MAX_BATCH = 200;

/** Adapt Obsidian's requestUrl (works on desktop and mobile, no CORS) to the fetch-like shape license.ts expects. */
const obsidianPost: HttpPost = async (url, init) => {
  const r = await requestUrl({ url, method: init.method, headers: init.headers, body: init.body, throw: false });
  return { status: r.status, json: async () => r.json as unknown };
};

/**
 * DOCX Export Studio. Free core: exports the active note to .docx inside the vault.
 * Pro (licence key from Gumroad): style presets, footnotes, header/footer, batch export.
 * Network: exactly one call to api.gumroad.com when the user presses Verify/Re-check. No telemetry.
 */
export default class DocxExportStudio extends Plugin {
  settings: Settings = { ...DEFAULTS };

  get gate(): ProGate {
    return this.settings.proActive ? new UnlockedGate() : new FreeGate();
  }

  async onload() {
    const saved = (await this.loadData()) as Partial<Settings> | null;
    this.settings = { ...DEFAULTS, ...saved };
    this.addSettingTab(new ExportSettingTab(this.app, this));

    this.addCommand({
      id: "export-current-note-docx",
      name: "Export current note to .docx",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.exportNotice(file);
        return true;
      },
    });
    this.addCommand({
      id: "export-folder-docx",
      name: "Export notes in folder to .docx (Pro)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.parent) return false;
        if (!checking) void this.exportFolder(file.parent);
        return true;
      },
    });
    this.addRibbonIcon("file-down", "Export current note to .docx", () => {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === "md") void this.exportNotice(file);
      else new Notice("Open a Markdown note first.");
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, f) => {
        if (f instanceof TFolder)
          menu.addItem((i) => i.setTitle("Export notes in folder to .docx (Pro)").setIcon("file-down").onClick(() => void this.exportFolder(f)));
      }),
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async exportNotice(file: TFile) {
    try {
      new Notice(`Exported to ${await this.exportFile(file)}`);
    } catch (e) {
      console.error("DOCX Export Studio:", e);
      new Notice("DOCX export failed. See the developer console for details.");
    }
  }

  private async exportFolder(folder: TFolder) {
    if (!this.gate.has("batch")) {
      new Notice("Batch export is a Pro feature. Enter your licence key in the plugin settings.");
      return;
    }
    const files: TFile[] = [];
    const walk = (f: TFolder) => {
      for (const c of f.children) {
        if (c instanceof TFile && c.extension === "md") files.push(c);
        else if (c instanceof TFolder && this.settings.batchSubfolders) walk(c);
      }
    };
    walk(folder);
    if (!files.length) {
      new Notice("No Markdown notes in this folder.");
      return;
    }
    const batch = files.slice(0, MAX_BATCH);
    let ok = 0;
    let failed = 0;
    for (const f of batch) {
      try {
        await this.exportFile(f);
        ok++;
      } catch (e) {
        failed++;
        console.error("DOCX Export Studio:", f.path, e);
      }
    }
    const capped = files.length > MAX_BATCH ? ` (first ${MAX_BATCH} of ${files.length})` : "";
    new Notice(`Exported ${ok} note(s)${capped}${failed ? `, ${failed} failed (see console)` : ""}.`);
  }

  /** Export one note next to itself; returns the new path. */
  private async exportFile(file: TFile): Promise<string> {
    const s = this.settings;
    const markdown = await this.app.vault.cachedRead(file);
    const bytes = await exportToDocx(markdown, {
      title: file.basename,
      gate: this.gate,
      pro: {
        preset: findPreset(s.presetId, s.customPresets),
        footnotes: s.footnotes,
        header: s.header || undefined,
        footer: s.footer || undefined,
        pageNumbers: s.pageNumbers,
      },
      resolveImage: async (src) => {
        const link = decodeURIComponent(src.split("#")[0]);
        const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        return target ? new Uint8Array(await this.app.vault.readBinary(target)) : null;
      },
    });
    const folder = file.parent && file.parent.path !== "/" ? file.parent.path + "/" : "";
    let path = normalizePath(`${folder}${file.basename}.docx`);
    let n = 1;
    while (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${folder}${file.basename} (${n++}).docx`);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await this.app.vault.createBinary(path, ab);
    return path;
  }
}

class ExportSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DocxExportStudio) {
    super(app, plugin);
  }

  display() {
    const { containerEl: el } = this;
    const s = this.plugin.settings;
    el.empty();

    new Setting(el).setName("Pro upgrade").setHeading();
    el.createEl("p", {
      text:
        "Optional paid upgrade (one-time purchase on Gumroad). Pro unlocks: " +
        Object.values(PRO_FEATURE_LABELS).join("; ") +
        ". The free export always works. Network use: pressing Verify sends your licence key and the product id to api.gumroad.com, once per press. Nothing else is ever sent. No telemetry.",
    });
    const status = el.createEl("p", { text: s.proActive ? "Status: Pro active." : "Status: free version." });
    const how = el.createEl("p");
    how.createEl("a", { text: "How to get Pro", href: HOW_TO_GET_PRO_URL });
    let key = s.licenseKey;
    new Setting(el)
      .setName("Licence key")
      .addText((t) => t.setPlaceholder("Paste your key").setValue(key).onChange((v) => (key = v)))
      .addButton((b) =>
        b.setButtonText(s.proActive ? "Re-check" : "Verify").onClick(() => void (async () => {
          b.setDisabled(true);
          const r = await verifyLicense(key, obsidianPost);
          s.proActive = r.status === "valid";
          s.licenseKey = r.status === "valid" || r.status === "refunded" ? key.trim() : s.licenseKey;
          await this.plugin.saveSettings();
          new Notice(r.message);
          this.display();
        })()),
      );
    void status;

    if (!s.proActive) return;

    new Setting(el).setName("Pro features").setHeading();
    const all = [...s.customPresets, ...BUILTIN_PRESETS];
    new Setting(el).setName("Style preset").addDropdown((d) => {
      all.forEach((p) => d.addOption(p.id, p.name));
      d.setValue(s.presetId).onChange(async (v) => {
        s.presetId = v;
        await this.plugin.saveSettings();
      });
    });
    new Setting(el).setName("Real footnotes (native .docx footnotes)").setDesc("Turn [^1] references and definitions into footnotes.").addToggle((t) =>
      t.setValue(s.footnotes).onChange(async (v) => {
        s.footnotes = v;
        await this.plugin.saveSettings();
      }),
    );
    new Setting(el).setName("Header text").addText((t) =>
      t.setValue(s.header).onChange(async (v) => {
        s.header = v;
        await this.plugin.saveSettings();
      }),
    );
    new Setting(el).setName("Footer text").addText((t) =>
      t.setValue(s.footer).onChange(async (v) => {
        s.footer = v;
        await this.plugin.saveSettings();
      }),
    );
    new Setting(el).setName("Page numbers").addToggle((t) =>
      t.setValue(s.pageNumbers).onChange(async (v) => {
        s.pageNumbers = v;
        await this.plugin.saveSettings();
      }),
    );
    new Setting(el).setName("Batch export includes subfolders").addToggle((t) =>
      t.setValue(s.batchSubfolders).onChange(async (v) => {
        s.batchSubfolders = v;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(el).setName("Custom preset").setHeading();
    const draft: Partial<StylePreset> = { name: "My preset", font: "Calibri", sizePt: 11, headingColor: "2F5496", lineSpacing: 1.15, marginIn: 1, page: "Letter" };
    new Setting(el).setName("Name").addText((t) => t.setValue(draft.name!).onChange((v) => (draft.name = v)));
    new Setting(el).setName("Font").addText((t) => t.setValue(draft.font!).onChange((v) => (draft.font = v)));
    new Setting(el).setName("Body size (pt)").addText((t) => t.setValue("11").onChange((v) => (draft.sizePt = Number(v))));
    new Setting(el).setName("Heading colour (RRGGBB)").addText((t) => t.setValue("2F5496").onChange((v) => (draft.headingColor = v)));
    new Setting(el).setName("Line spacing (1 = single)").addText((t) => t.setValue("1.15").onChange((v) => (draft.lineSpacing = Number(v))));
    new Setting(el).setName("Margins (inches)").addText((t) => t.setValue("1").onChange((v) => (draft.marginIn = Number(v))));
    new Setting(el).setName("Page size").addDropdown((d) =>
      d.addOption("Letter", "Letter").addOption("A4", "A4").setValue("Letter").onChange((v) => (draft.page = v as "A4" | "Letter")),
    );
    new Setting(el).addButton((b) =>
      b.setButtonText("Save preset").onClick(async () => {
        const name = (draft.name ?? "").trim() || "My preset";
        const p = sanitizePreset({ ...draft, id: `custom-${Date.now()}`, name });
        s.customPresets.push(p);
        s.presetId = p.id;
        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }
}
