import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');

async function run(md: string) {
  const bytes = await exportToDocx(md, {
    title: "T",
    sourcePath: "Main.md",
    resolveImage: async (s) => (s === "pic.png" ? PNG : s === "logo.svg" ? SVG : null),
  });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
  return { xml, media, text: [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ") };
}
const drawings = (xml: string) => (xml.match(/<w:drawing>/g) ?? []).length;

describe("image cases", () => {
  it("wikilink embed without width", async () => {
    const r = await run("![[pic.png]]");
    expect(drawings(r.xml)).toBe(1);
    expect(r.media.length).toBeGreaterThanOrEqual(1); // docx lib may add a fallback copy
  });
  it("wikilink embed with |width sets the size", async () => {
    const r = await run("![[pic.png|300]]");
    expect(drawings(r.xml)).toBe(1);
    expect(r.xml).toContain(`cx="${300 * 9525}"`);
  });
  it("markdown relative image", async () => {
    expect(drawings((await run("![a](pic.png)")).xml)).toBe(1);
  });
  it("remote https image becomes a visible placeholder", async () => {
    const r = await run("![r](https://example.com/a.png)");
    expect(drawings(r.xml)).toBe(0);
    expect(r.text).toContain("remote image not downloaded");
  });
  it("missing file becomes a visible placeholder, no failure", async () => {
    const r = await run("before ![[gone.png]] after");
    expect(r.text).toContain("image not found: gone.png");
    expect(r.text).toContain("after");
  });
  it("SVG becomes a visible placeholder", async () => {
    const r = await run("![[logo.svg]]");
    expect(drawings(r.xml)).toBe(0);
    expect(r.text).toContain("unsupported image type");
  });
  it("image inside a table cell", async () => {
    const r = await run("| a | b |\n|---|---|\n| ![[pic.png]] | ![[gone.png]] |\n");
    expect(drawings(r.xml)).toBe(1);
    expect(r.text).toContain("image not found");
  });
});
