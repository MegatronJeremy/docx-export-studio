import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";
import { extractFootnotes, parseInline } from "../src/parser";
import { BUILTIN_PRESETS, PRO_FEATURE_LABELS, FreeGate, UnlockedGate, findPreset, sanitizePreset } from "../src/pro";

const md = "# Title\n\nClaim one.[^a] Second.[^b] Unknown[^zz].\n\n- [x] done\n- [ ] todo\n\n[^a]: First note\n    continues here.\n[^b]: Second *note*.\n\n```\n[^c]: not a def\n```\n";
const parts = async (opts: Parameters<typeof exportToDocx>[1]) => {
  const zip = await JSZip.loadAsync(await exportToDocx(md, opts));
  const get = async (n: string) => (zip.file(n) ? await zip.file(n)!.async("string") : "");
  return { zip, doc: await get("word/document.xml"), fn: await get("word/footnotes.xml"), styles: await get("word/styles.xml") };
};
const pro = { footnotes: true, header: "HEAD_TXT", footer: "FOOT_TXT", pageNumbers: true, preset: findPreset("academic", [])! };

describe("footnote parsing", () => {
  it("parses refs but not definitions as refs", () => {
    expect(parseInline("a[^1] b")).toEqual([{ t: "text", text: "a" }, { t: "fnref", id: "1" }, { t: "text", text: " b" }]);
  });
  it("extracts definitions with continuations and skips fenced code", () => {
    const { text, defs } = extractFootnotes(md);
    expect(defs.get("a")).toBe("First note continues here.");
    expect(defs.get("b")).toBe("Second *note*.");
    expect(defs.has("c")).toBe(false);
    expect(text).toContain("[^c]: not a def");
    expect(text).not.toContain("First note");
  });
});

describe("inline footnotes", () => {
  const src = "Para.[^1] Two.[^2] Three.[^3] Inline.^[Inline *body* here.] Code `^[no]` stays.\n\n[^1]: One\n[^2]: Two\n[^3]: Three\n\n```\n^[fenced]\n```\n";
  it("writes 4 native footnotes with matching ids", async () => {
    const zip = await JSZip.loadAsync(await exportToDocx(src, { gate: new UnlockedGate(), pro }));
    const doc = await zip.file("word/document.xml")!.async("string");
    const fn = await zip.file("word/footnotes.xml")!.async("string");
    const refs = [...doc.matchAll(/<w:footnoteReference w:id="(\d+)"/g)].map((m) => m[1]);
    const ids = [...fn.matchAll(/<w:footnote (?:[^>]*? )?w:id="(\d+)"/g)].map((m) => m[1]).filter((x) => Number(x) > 0);
    expect(refs).toHaveLength(4);
    expect(ids.sort()).toEqual([...refs].sort());
    expect(fn).toContain("Inline");
    expect(fn).toContain("body");
    expect(doc).toContain("^[no]");
    expect(doc).toContain("^[fenced]");
  });
});

describe("free build ignores Pro options", () => {
  it("keeps literal [^a] text, no footnotes, header, footer or preset", async () => {
    const p = await parts({ gate: new FreeGate(), pro });
    expect(p.doc).toContain("[^a]");
    expect(p.fn).not.toContain("First note");
    expect(p.zip.file("word/header1.xml")).toBeNull();
    expect(p.zip.file("word/footer1.xml")).toBeNull();
    expect(p.styles).not.toContain("Times New Roman");
  });
});

describe("Pro features", () => {
  it("writes real .docx footnotes and leaves unknown refs as text", async () => {
    const p = await parts({ gate: new UnlockedGate(), pro });
    expect(p.doc.match(/<w:footnoteReference /g)?.length).toBe(2);
    expect(p.fn).toContain("First note continues here.");
    expect(p.fn).toContain("Second");
    expect(p.doc).toContain("[^zz]");
    expect(p.doc).not.toContain("First note");
  });
  it("footnotes can be switched off while Pro is active", async () => {
    const p = await parts({ gate: new UnlockedGate(), pro: { ...pro, footnotes: false } });
    expect(p.doc).toContain("[^a]");
  });
  it("adds header, footer and page number fields", async () => {
    const p = await parts({ gate: new UnlockedGate(), pro });
    expect(await p.zip.file("word/header1.xml")!.async("string")).toContain("HEAD_TXT");
    const foot = await p.zip.file("word/footer1.xml")!.async("string");
    expect(foot).toContain("FOOT_TXT");
    expect(foot).toMatch(/PAGE/);
    expect(foot).toMatch(/NUMPAGES/);
  });
  it("applies the preset: font, size, line spacing, margins, heading colour", async () => {
    const p = await parts({ gate: new UnlockedGate(), pro });
    expect(p.styles).toContain("Times New Roman");
    expect(p.styles).toContain('w:line="480"');
    expect(p.doc).toContain('w:pgMar w:top="1440"');
    const a4 = await parts({ gate: new UnlockedGate(), pro: { preset: findPreset("business", [])! } });
    expect(a4.doc).toContain('w:w="11906"');
    expect(a4.styles).toContain("1F3864");
  });
  it("uses a font that has the checkbox glyphs", async () => {
    const p = await parts({ gate: new FreeGate() });
    expect(p.doc).toContain("Segoe UI Symbol");
    expect(p.doc).toContain("☑");
  });
});

describe("presets", () => {
  it("sanitises custom values", () => {
    const s = sanitizePreset({ id: "x", name: "n", font: "<bad>", sizePt: 999, headingColor: "zzz", lineSpacing: -1, marginIn: NaN, page: "A4" });
    expect(s).toMatchObject({ font: "Calibri", sizePt: 24, headingColor: "2F5496", lineSpacing: 1, marginIn: 1, page: "A4" });
    expect(findPreset("x", [s])).toBe(s);
    expect(BUILTIN_PRESETS.length).toBe(4);
  });
});

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const soffice = spawnSync("soffice", ["--version"], { encoding: "utf8" });
describe.skipIf(soffice.status !== 0)("LibreOffice opens the Pro document", () => {
  it("converts to text with footnote markers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wes-pro-"));
    writeFileSync(join(dir, "p.docx"), await exportToDocx(md, { gate: new UnlockedGate(), pro }));
    const r = spawnSync("soffice", ["--headless", "--convert-to", "txt:Text", "--outdir", dir, join(dir, "p.docx")], { encoding: "utf8", timeout: 120000 });
    expect(r.status).toBe(0);
    const txt = readFileSync(join(dir, "p.txt"), "utf8");
    expect(txt).toContain("Claim one.1 Second.2"); // LibreOffice text export shows footnote markers, not footnote bodies
    expect(txt).toContain("Claim one.");
  }, 130000);
});

describe("Pro labels", () => {
  it("name only what is built", () => {
    expect(PRO_FEATURE_LABELS.templates).toBe("Style presets (built-in and your own)");
    expect(PRO_FEATURE_LABELS.footnotes).toBe("Real footnotes (native .docx footnotes)");
    expect(Object.values(PRO_FEATURE_LABELS).join(" ")).not.toMatch(/word|template/i);
  });
});
