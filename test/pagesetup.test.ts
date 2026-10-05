import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

async function sect(page?: { size?: "A4" | "Letter"; margins?: "normal" | "narrow" }) {
  const zip = await JSZip.loadAsync(await exportToDocx("Hello", { page }));
  const doc = await zip.file("word/document.xml")!.async("string");
  return doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)![0];
}

describe("page setup (free tier)", () => {
  it("defaults to A4 with 1 inch margins", async () => {
    const s = await sect();
    expect(s).toMatch(/<w:pgSz[^>]*w:w="11906"/);
    expect(s).toMatch(/<w:pgSz[^>]*w:h="16838"/);
    expect(s).toMatch(/w:top="1440"/);
  });
  it("writes Letter", async () => {
    const s = await sect({ size: "Letter" });
    expect(s).toMatch(/<w:pgSz[^>]*w:w="12240"/);
    expect(s).toMatch(/<w:pgSz[^>]*w:h="15840"/);
  });
  it("writes narrow margins", async () => {
    const s = await sect({ size: "A4", margins: "narrow" });
    for (const side of ["top", "bottom", "left", "right"]) expect(s).toContain(`w:${side}="720"`);
  });
});
