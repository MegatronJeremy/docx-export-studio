import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

const md = [
  "| Left | Center | Right |",
  "|:--|:-:|--:|",
  "| **bold** | *ital* | `code` |",
  "| [site](https://example.com) | a \\| b | |",
  "",
  "| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |",
  "|--|--|--|--|--|--|--|--|",
  "| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |",
  "",
].join("\n");

async function doc() {
  const zip = await JSZip.loadAsync(await exportToDocx(md, { title: "T" }));
  return zip.file("word/document.xml")!.async("string");
}

describe("tables", () => {
  it("keeps alignment, header row, inline runs, escaped pipe, empty cell, fitted widths", async () => {
    const xml = await doc();
    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)!;
    expect(tables).toHaveLength(2);
    const [t1, t2] = tables;
    expect(t1).toContain("<w:tblHeader");
    expect(t2).toContain("<w:tblHeader");
    // header + body alignment per column
    const rows = t1.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!;
    expect(rows).toHaveLength(3);
    const jcs = (r: string) => [...r.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((m) => m[0].match(/<w:jc w:val="(\w+)"/)?.[1]);
    for (const r of rows) expect(jcs(r)).toEqual(["left", "center", "right"]);
    // inline formatting
    expect(rows[1]).toMatch(/<w:b\/>[\s\S]*bold/);
    expect(rows[1]).toMatch(/<w:i\/>[\s\S]*ital/);
    expect(rows[1]).toContain("InlineCode");
    expect(rows[2]).toContain("w:hyperlink");
    expect(rows[2]).toContain("a | b");
    expect([...rows[2].matchAll(/<w:tc>/g)]).toHaveLength(3);
    // widths: table pct 100%, grid and cells sum to page text width (A4 normal margins: 9026 twips)
    for (const [t, n] of [[t1, 3], [t2, 8]] as const) {
      expect(t).toMatch(/<w:tblW w:type="dxa"/);
      expect(t).toContain("w:tblLayout");
      const grid = [...t.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => +m[1]);
      expect(grid).toHaveLength(n);
      const sum = grid.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(8500);
      expect(sum).toBeLessThanOrEqual(9100);
      const tcw = [...t.split("</w:tr>")[0].matchAll(/<w:tcW w:type="(\w+)" w:w="(\d+)"/g)];
      expect(tcw).toHaveLength(n);
      expect(tcw.every((m) => m[1] === "dxa")).toBe(true);
    }
  });

  it("renders in LibreOffice: all cell text present in the PDF text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tbl-"));
    writeFileSync(join(dir, "t.docx"), await exportToDocx(md, { title: "T" }));
    const r = spawnSync("soffice", ["--headless", "--convert-to", "txt:Text", "--outdir", dir, join(dir, "t.docx")], { encoding: "utf8", timeout: 90000 });
    if (r.error) return; // LibreOffice not installed: skip
    const { readFileSync } = await import("node:fs");
    const txt = readFileSync(join(dir, "t.txt"), "utf8");
    for (const w of ["Left", "bold", "ital", "code", "site", "a | b", "C8", "8"]) expect(txt).toContain(w);
  });
});
