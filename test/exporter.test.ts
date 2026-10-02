import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";
import { imageInfo } from "../src/imagesize";

// 1x1 transparent PNG
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

const fixture = readFileSync(join(__dirname, "fixtures", "full.md"), "utf8");
let bytes: Uint8Array;
let xml: string;
let zip: JSZip;

beforeAll(async () => {
  bytes = await exportToDocx(fixture, {
    title: "Fixture",
    resolveImage: async (src) => (src === "pixel.png" ? PNG : null),
  });
  zip = await JSZip.loadAsync(bytes);
  xml = await zip.file("word/document.xml")!.async("string");
});

describe("docx structure", () => {
  it("is a zip with the required OOXML parts", () => {
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(zip.file("word/document.xml")).toBeTruthy();
    expect(zip.file("word/numbering.xml")).toBeTruthy();
  });

  it("contains headings, text and the last paragraph", () => {
    expect(xml).toContain("Project Report");
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain("UNIQUE_END_MARKER");
  });

  it("drops frontmatter and comments", () => {
    expect(xml).not.toContain("Frontmatter must not appear");
    expect(xml).not.toContain("hidden comment");
  });

  it("applies inline formatting", () => {
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:i/>");
    expect(xml).toContain("<w:strike/>");
    expect(xml).toContain("<w:highlight");
    expect(xml).toContain("wikilink alias");
    expect(xml).not.toContain("[[Other Note");
  });

  it("creates an external hyperlink relationship", async () => {
    expect(xml).toContain("<w:hyperlink");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("https://example.com/page");
  });

  it("renders lists with numbering and task glyphs", () => {
    expect(xml).toContain("<w:numPr>");
    expect(xml).toContain("Nested bullet");
    expect(xml).toContain('w:ilvl w:val="2"');
    expect(xml).toContain("☐ ");
    expect(xml).toContain("☑ ");
  });

  it("renders the table with alignment", () => {
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("Pear with ");
    expect(xml).toContain('w:jc w:val="center"');
    expect(xml).toContain('w:jc w:val="right"');
  });

  it("renders code in a monospace font", () => {
    expect(xml).toContain("Consolas");
    expect(xml).toContain("function hello(name: string)");
  });

  it("renders callouts with title and a left border", () => {
    expect(xml).toContain("Careful");
    expect(xml).toContain("Note"); // default title
    expect(xml).toContain("<w:pBdr>");
  });

  it("embeds a resolved image and flags a missing one", () => {
    expect(xml).toContain("<w:drawing>");
    expect(zip.file(/word\/media\/.+/).length).toBe(1);
    expect(xml).toContain("image not found: missing");
  });

  it("sizes embeds by width and keeps aspect ratio", () => {
    expect(imageInfo(PNG)).toEqual({ kind: "png", width: 1, height: 1 });
    expect(xml).toContain('cx="1905000"'); // 200px = 1,905,000 EMU
    expect(xml).toContain('cy="1905000"');
  });

  it("does not request remote images", async () => {
    let called = false;
    const out = await exportToDocx("![x](https://example.com/a.png)", {
      resolveImage: async () => {
        called = true;
        return PNG;
      },
    });
    const x = await (await JSZip.loadAsync(out)).file("word/document.xml")!.async("string");
    expect(called).toBe(false);
    expect(x).toContain("remote image not downloaded");
  });

  it("handles an empty note", async () => {
    const out = await exportToDocx("");
    expect((await JSZip.loadAsync(out)).file("word/document.xml")).toBeTruthy();
  });
});

const soffice = spawnSync("soffice", ["--version"], { encoding: "utf8" });
describe.skipIf(soffice.status !== 0)("LibreOffice headless", () => {
  it("opens the exported file and converts it to PDF and plain text", () => {
    const dir = mkdtempSync(join(tmpdir(), "docx-"));
    const file = join(dir, "full.docx");
    writeFileSync(file, bytes);
    const pdf = spawnSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", dir, file], { encoding: "utf8", timeout: 120000 });
    expect(pdf.status).toBe(0);
    expect(readFileSync(join(dir, "full.pdf")).subarray(0, 4).toString()).toBe("%PDF");
    const txt = spawnSync("soffice", ["--headless", "--convert-to", "txt:Text", "--outdir", dir, file], { encoding: "utf8", timeout: 120000 });
    expect(txt.status).toBe(0);
    const text = readFileSync(join(dir, "full.txt"), "utf8");
    expect(text).toContain("Project Report");
    expect(text).toContain("UNIQUE_END_MARKER");
    expect(text).toContain("Nested bullet");
  }, 240000);
});
