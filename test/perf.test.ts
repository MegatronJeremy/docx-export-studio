import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

async function docXml(md: string): Promise<string> {
  const zip = await JSZip.loadAsync(await exportToDocx(md, { title: "t" }));
  return zip.file("word/document.xml")!.async("string");
}

describe("ordered lists at scale", () => {
  it("separate ordered lists restart at 1 (distinct numIds)", async () => {
    const xml = await docXml("1. a\n2. b\n\ntext\n\n1. c\n2. d\n");
    const ids = [...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it("1500 ordered lists export fast, extra lists use literal numbers", async () => {
    let md = "";
    for (let i = 0; i < 1500; i++) md += `## S${i}\n\n1. a${i}\n2. b${i}\n   1. c${i}\n\n`;
    const t = Date.now();
    const xml = await docXml(md);
    expect(Date.now() - t).toBeLessThan(15000);
    expect(xml).toContain("b1499");
    expect(xml).toMatch(/<w:t[^>]*>2\. <\/w:t>/);
  }, 30000);
});

describe("size guard", () => {
  it("refuses a note over the limit with a clear message", async () => {
    await expect(exportToDocx("x".repeat(2_600_000), { title: "t" })).rejects.toThrow(/too large/);
  });
});
