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

describe("Obsidian-only syntax gaps (task_d90e16ab)", () => {
  it("block id marker at end of paragraph/list item/heading does not leak", async () => {
    const { text } = await run("A paragraph ^para-1\n\n- item one ^li\n\n## Head ^hd\n\nafter");
    expect(text).toContain("A paragraph");
    expect(text).not.toContain("^para-1");
    expect(text).not.toContain("^li");
    expect(text).not.toContain("^hd");
  });
  it("standalone block id line is dropped", async () => {
    const { text } = await run("> quote line\n\n^qid\n\nnext");
    expect(text).not.toContain("^qid");
  });
  it("embed with alias and callout-contained embed/highlight/tag", async () => {
    const { text } = await run("![[Simple|shown]]\n\n> [!note] T\n> ==hot== and #tag/sub and [[Plain|al]]\n");
    expect(text).toContain("Simple body text");
    expect(text).not.toContain("![[");
    expect(text).not.toContain("==");
    expect(text).toContain("al");
    expect(text).not.toContain("[[");
  });
  it("mid-line note embed does not leak raw brackets", async () => {
    const { text } = await run("See ![[Simple]] inline");
    expect(text).not.toContain("![[");
  });
  it("comments inside callout and multi-line %% blocks dropped", async () => {
    const { text } = await run("> [!tip] X\n> keep %%hid%% this\n\n%%\nmulti\nline\n%%\n\nend");
    expect(text).not.toContain("hid");
    expect(text).not.toContain("multi");
    expect(text).toContain("keep");
    expect(text).toContain("end");
  });
});
