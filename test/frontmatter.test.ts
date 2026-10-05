import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

async function parts(md: string, title?: string) {
  const zip = await JSZip.loadAsync(await exportToDocx(md, { title }));
  return {
    doc: await zip.file("word/document.xml")!.async("string"),
    core: await zip.file("docProps/core.xml")!.async("string"),
  };
}

describe("frontmatter", () => {
  const md = [
    "---",
    "title: My Report, Final",
    "author: Ada Lovelace",
    "tags: [alpha, beta]",
    "aliases:",
    "  - SECRET_ALIAS",
    "date: 2026-01-31",
    "---",
    "",
    "Body text here.",
  ].join("\n");

  it("never prints YAML in the body and puts title/author in core properties", async () => {
    const { doc, core } = await parts(md, "file-name");
    expect(doc).toContain("Body text here.");
    for (const leak of ["SECRET_ALIAS", "Ada Lovelace", "My Report", "2026-01-31", "alpha", "aliases", "---"])
      expect(doc).not.toContain(leak);
    expect(core).toContain("<dc:title>My Report, Final</dc:title>");
    expect(core).toContain("<dc:creator>Ada Lovelace</dc:creator>");
    for (const leak of ["SECRET_ALIAS", "alpha", "2026-01-31"]) expect(core).not.toContain(leak);
  });

  it("falls back to the file name and default creator without title/author", async () => {
    const { core } = await parts("---\ntags: [x]\n---\nHi", "file-name");
    expect(core).toContain("<dc:title>file-name</dc:title>");
    expect(core).toContain("<dc:creator>DOCX Export Studio</dc:creator>");
  });

  it("handles quoted values and author lists", async () => {
    const { core } = await parts("---\ntitle: \"Quoted: Title\"\nauthor:\n  - Grace Hopper\n  - Other\n---\nHi");
    expect(core).toContain("<dc:title>Quoted: Title</dc:title>");
    expect(core).toContain("<dc:creator>Grace Hopper</dc:creator>");
  });
});
