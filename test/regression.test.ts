import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportToDocx } from "../src/exporter";

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

const NOTES: Record<string, string> = {
  Simple: "---\ntags: x\n---\nSimple body text",
  Sections: "# Intro\nintro text\n\n## Target\ntarget text\n\n### Deeper\ndeeper text\n\n## Other\nother text",
  Blocks: "first para\n\nthe quoted block line one\nline two ^abc\n\nlast para",
  A: "A content\n\n![[B]]",
  B: "B content\n\n![[A]]",
  L1: "L1 text\n\n![[L2]]",
  L2: "L2 text\n\n![[L3]]",
  L3: "L3 text\n\n![[L4]]",
  L4: "L4 text",
};

async function run(md: string) {
  const bytes = await exportToDocx(md, {
    title: "T",
    sourcePath: "Main.md",
    resolveNote: async (link) => (link in NOTES ? { path: link + ".md", text: NOTES[link] } : null),
    resolveImage: async (s) => (s === "pic.png" || s === "My Pic.png" ? PNG : null),
  });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  // well-formed check: every tag opens/closes balanced via a simple stack
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>/g)) {
    if (m[1] === "?" || m[3] === "/") continue;
    if (m[1] === "/") expect(stack.pop()).toBe(m[2]);
    else stack.push(m[2]);
  }
  expect(stack).toEqual([]);
  // rels resolve
  for (const m of xml.matchAll(/r:(?:id|embed)="([^"]+)"/g)) expect(rels).toContain(`Id="${m[1]}"`);
  const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("|");
  return { xml, text, zip, rels };
}

describe("real-world Obsidian syntax", () => {
  it("callouts: nested and foldable", async () => {
    const { text } = await run("> [!note]- Folded title\n> body one\n> > [!tip] Inner\n> > inner body\n\n> [!faq]+ Open\n> open body\n");
    expect(text).toContain("Folded title");
    expect(text).toContain("body one");
    expect(text).toContain("Inner");
    expect(text).toContain("inner body");
    expect(text).toContain("open body");
    expect(text).not.toContain("[!");
    expect(text).not.toMatch(/\[!/);
  });

  it("wikilinks with alias and heading", async () => {
    const { text } = await run("See [[Note#Heading|shown]], [[Note#Sec]], [[Plain]], [[folder/Deep Note]] and [[Note^blockid]].");
    expect(text).toContain("shown");
    expect(text).not.toContain("[[");
    expect(text).not.toContain("]]");
    expect(text).not.toContain("|shown");
    expect(text).toContain("Plain");
  });

  it("images: local, spaced, sized, remote, missing", async () => {
    const { xml, text } = await run(
      "![[pic.png]]\n\n![[pic.png|200]]\n\n![alt](pic.png)\n\n![[My Pic.png]]\n\n![remote](https://example.com/a.png)\n\n![[missing.png]]\n",
    );
    expect((xml.match(/<w:drawing>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain("![");
    expect(text).not.toContain("![[");
  });

  it("note embeds do not leak raw syntax", async () => {
    const { text } = await run("Before\n\n![[Other note]]\n\n![[Other note#Heading]]\n\nAfter");
    expect(text).not.toContain("![[");
    expect(text).not.toContain("]]");
    expect(text).toContain("After");
  });

  it("embeds: whole note is inlined, frontmatter dropped", async () => {
    const { text } = await run("Before\n\n![[Simple]]\n\nAfter");
    expect(text).toContain("Simple body text");
    expect(text).not.toContain("tags");
    expect(text).not.toContain("![[");
  });

  it("embeds: heading section only, up to the next same-level heading", async () => {
    const { text } = await run("![[Sections#Target]]");
    expect(text).toContain("target text");
    expect(text).toContain("deeper text");
    expect(text).not.toContain("intro text");
    expect(text).not.toContain("other text");
  });

  it("embeds: block reference inlines only that block, marker removed", async () => {
    const { text } = await run("![[Blocks#^abc]]");
    expect(text).toContain("the quoted block line one");
    expect(text).toContain("line two");
    expect(text).not.toContain("first para");
    expect(text).not.toContain("last para");
    expect(text).not.toContain("^abc");
  });

  it("embeds: cycle falls back to a plain link", async () => {
    const { text } = await run("![[A]]");
    expect(text).toContain("A content");
    expect(text).toContain("B content");
    expect(text).not.toContain("![[");
    expect(text.match(/A content/g)).toHaveLength(1);
  });

  it("embeds: depth limit of 3, then a plain link", async () => {
    const { text } = await run("![[L1]]");
    expect(text).toContain("L1 text");
    expect(text).toContain("L3 text");
    expect(text).not.toContain("L4 text");
    expect(text).toContain("L4");
  });

  it("embeds: missing note or heading becomes plain text, image embeds untouched", async () => {
    const { text } = await run("![[Nope]]\n\n![[Sections#Nothing]]\n\n![[pic.png]]\n\nEnd");
    expect(text).toContain("Nope");
    expect(text).toContain("Nothing");
    expect(text).not.toContain("![[");
    expect(text).toContain("End");
  });

  it("embeds: embed inside a code fence is left alone", async () => {
    const { text } = await run("```\n![[Simple]]\n```");
    expect(text).toContain("![[Simple]]");
    expect(text).not.toContain("Simple body text");
  });

  it("tables: alignment and inline formatting", async () => {
    const { xml, text } = await run("| A | B | C |\n|:--|:-:|--:|\n| **bold** | *it* | `code` |\n| [[W|alias]] | ==hl== | a \\| b |\n");
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain('w:jc w:val="center"');
    expect(xml).toContain('w:jc w:val="right"');
    expect(text).toContain("bold");
    expect(text).toContain("alias");
    expect(text).not.toContain("**");
    expect(text).not.toContain("==");
    expect(text).not.toContain("[[");
    expect(text).toContain("a | b");
  });

  it("footnotes inline and referenced", async () => {
    const { xml, text } = await run("Claim[^1] and another[^note] and inline^[inline fn text].\n\n[^1]: First note.\n[^note]: Second note.\n");
    // Footnotes are a Pro feature: the free build keeps the source text as-is (known issue, see README).
    expect(text).toContain("Claim");
    expect(xml).not.toContain("w:footnoteReference");
  });

  it("task lists with variants", async () => {
    const { text } = await run("- [ ] open\n- [x] done\n- [X] done caps\n- [/] partial\n- [-] cancelled\n1. [ ] numbered task\n");
    expect(text).toContain("open");
    expect(text).toContain("done caps");
    expect(text).toContain("partial");
    expect(text).toContain("cancelled");
    expect(text).not.toMatch(/\[[ xX\/-]\]/);
  });

  it("math becomes native Word equations; currency stays text", async () => {
    const { xml, text } = await run("Inline $E=mc^2$ here, price is $5 and $6 ok.\n\n$$\n\\frac{a}{b} = c\n$$\n\nAfter math");
    expect(xml).toContain("<m:oMath");
    expect(xml).toContain("<m:oMathPara");
    expect(xml).toContain("<m:sSup>");
    expect(xml).toContain("<m:f>");
    expect(text).toContain("After math");
    expect(text).toContain("$5 and $6");
  });

  it("code blocks with language and special chars", async () => {
    const { xml, text } = await run("```python\ndef f(x):\n    return x < 3 && y > 2 # \"q\" & 'a'\n```\n\n~~~\ntilde fence\n~~~\n");
    expect(xml).toContain("CodeBlock");
    expect(text).toContain("def f(x):");
    expect(text).toContain("tilde fence");
    expect(text).not.toContain("```");
    expect(text).not.toContain("python|");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&amp;");
  });

  it("highlights, tags, comments, frontmatter", async () => {
    const { xml, text } = await run("---\ntitle: X\naliases: [a]\n---\nA ==marked text== and #tag and #nested/tag.\n\n%% hidden %%\n\n%%\nmulti\nline\n%%\n\nEnd");
    expect(xml).toContain("<w:highlight");
    expect(text).not.toContain("==");
    expect(text).not.toContain("title: X");
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("multi");
    expect(text).toContain("#tag");
    expect(text).toContain("End");
  });

  it("non-Latin text: Cyrillic, CJK, RTL, emoji", async () => {
    const { text } = await run("# Привет мир\n\nЭто **жирный** текст.\n\n日本語のテキスト と 中文内容。\n\nمرحبا بالعالم **غامق**\n\nשלום עולם 🎉\n\n- пункт один\n");
    for (const s of ["Привет мир", "жирный", "日本語のテキスト", "中文内容", "مرحبا بالعالم", "غامق", "שלום עולם", "🎉", "пункт один"]) expect(text).toContain(s);
    expect(text).not.toContain("**");
  });

  it("control characters and odd input do not break XML", async () => {
    const { text } = await run("A\u0000B \u0008 vertical\u000Btab & <b>html</b> \"q\"\r\n\r\nLine two\r\n");
    expect(text).toContain("Line two");
  });

  it("empty and frontmatter-only notes still produce a valid file", async () => {
    await run("");
    await run("---\na: 1\n---\n");
  });

  it("escaped markdown chars and nested emphasis", async () => {
    const { text } = await run("\\*not bold\\* and **bold with *nested italic* inside** and snake_case_word and 2*3*4");
    expect(text).toContain("*not bold*");
    expect(text).toContain("snake_case_word");
    expect(text).not.toContain("**");
  });

  it("headings with trailing hashes, setext, hr, html comments", async () => {
    const { xml, text } = await run("Title\n=====\n\n## Sub ##\n\n***\n\n<!-- html comment -->\n\ntext");
    expect(xml).toContain('w:val="Heading1"');
    expect(text).toContain("Sub");
    expect(text).not.toContain("##");
    expect(text).not.toContain("html comment");
  });
});
