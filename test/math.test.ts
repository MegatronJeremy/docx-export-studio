import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { latexToOmml } from "../src/math";
import { parseMarkdown, parseInline } from "../src/parser";
import { exportToDocx } from "../src/exporter";

describe("latexToOmml", () => {
  it("fraction", () => {
    const x = latexToOmml("\\frac{a+b}{2}");
    expect(x).toContain("<m:f>");
    expect(x).toContain("<m:num>");
    expect(x).toContain("<m:den>");
  });
  it("sum with limits", () => {
    const x = latexToOmml("\\sum_{i=1}^{n} i^2");
    expect(x).toContain("<m:nary>");
    expect(x).toContain('m:val="∑"');
    expect(x).toContain("<m:sSup>");
    expect(x).toMatch(/<m:sub>.*i=1.*<\/m:sub>/);
  });
  it("matrix", () => {
    const x = latexToOmml("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}");
    expect(x).toContain("<m:m>");
    expect((x.match(/<m:mr>/g) ?? []).length).toBe(2);
    expect((x.match(/<m:e>/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(x).toContain('m:begChr m:val="("');
  });
  it("sqrt, greek, left/right", () => {
    const x = latexToOmml("\\left( \\sqrt{\\alpha} \\right)");
    expect(x).toContain("<m:rad>");
    expect(x).toContain("α");
    expect(x).toContain("<m:d>");
  });
  it("throws on malformed input", () => {
    expect(() => latexToOmml("\\frac{a")).toThrow();
    expect(() => latexToOmml("\\notacommand{x}")).toThrow();
    expect(() => latexToOmml("\\begin{pmatrix} a \\end{bmatrix}")).toThrow();
  });
});

describe("math parsing", () => {
  it("inline math, but not currency", () => {
    const n = parseInline("costs $5 and $10, while $x^2$ holds");
    expect(n.filter((i) => i.t === "math")).toEqual([{ t: "math", tex: "x^2" }]);
  });
  it("escaped dollar stays text", () => {
    expect(parseInline("\\$a\\$").some((i) => i.t === "math")).toBe(false);
  });
  it("block math, single and multi line", () => {
    const b = parseMarkdown("$$ E=mc^2 $$\n\ntext\n\n$$\n\\frac{a}{b}\n$$\n");
    expect(b.map((x) => x.t)).toEqual(["math", "paragraph", "math"]);
  });
});

async function docXml(md: string): Promise<string> {
  const z = await JSZip.loadAsync(await exportToDocx(md, {}));
  return z.file("word/document.xml")!.async("string");
}

describe("math export", () => {
  it("writes native OMML for inline and block equations", async () => {
    const xml = await docXml("Inline $\\frac{1}{2}$ here.\n\n$$\\sum_{k=1}^{n} k$$\n");
    expect(xml).toContain("<m:oMath");
    expect(xml).toContain("<m:oMathPara");
    expect(xml).toContain("<m:f>");
    expect(xml).toContain("<m:nary>");
    expect(xml).not.toContain("\\frac");
  });
  it("falls back to monospace LaTeX when conversion fails", async () => {
    const xml = await docXml("Bad $\\frac{a$ and $\\bogus{x}$ end.\n\n$$\\frac{a$$\n");
    expect(xml).not.toContain("<m:oMath");
    expect(xml).toContain("\\bogus{x}");
    expect(xml).toContain("Consolas");
  });
});
