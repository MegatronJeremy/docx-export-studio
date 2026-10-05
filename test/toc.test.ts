import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

async function xml(md: string, toc?: boolean) {
  const zip = await JSZip.loadAsync(await exportToDocx(md, { toc }));
  return { doc: await zip.file("word/document.xml")!.async("string"), settings: await zip.file("word/settings.xml")!.async("string") };
}
const md = "# One\n\n## Two\n\n### Three\n\n#### Four\n\ntext\n";

describe("table of contents", () => {
  it("maps H1-H4 to Word Heading 1-4 styles", async () => {
    const { doc } = await xml(md);
    for (const n of [1, 2, 3, 4]) expect(doc).toContain(`<w:pStyle w:val="Heading${n}"/>`);
    expect(doc).not.toContain("TOC \\");
  });
  it("adds a TOC field when the setting is on", async () => {
    const { doc, settings } = await xml(md, true);
    expect(doc).toContain("TOC \\h \\o &quot;1-4&quot;");
    expect(doc.indexOf("TOC ")).toBeLessThan(doc.indexOf("One"));
    expect(settings).toContain("updateFields");
  });
  it("[[toc]] and %% toc %% lines add the field and are not printed", async () => {
    for (const m of ["[[toc]]", "%% toc %%"]) {
      const { doc } = await xml(`${m}\n\n${md}`);
      expect(doc).toContain("TOC ");
      expect(doc).not.toMatch(/\[\[toc\]\]|%% ?toc/i);
    }
  });
});
