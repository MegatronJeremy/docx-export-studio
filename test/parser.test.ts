import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, splitRow } from "../src/parser";

describe("parseMarkdown", () => {
  it("strips frontmatter and comments", () => {
    const b = parseMarkdown("---\na: 1\n---\n# T\n\n%% secret %%\nbody");
    expect(b[0]).toMatchObject({ t: "heading", level: 1 });
    expect(JSON.stringify(b)).not.toContain("secret");
    expect(JSON.stringify(b)).not.toContain("a: 1");
  });

  it("nests lists by indentation and detects ordered/task items", () => {
    const [list] = parseMarkdown("- a\n  - b\n    - c\n- d\n");
    expect(list.t).toBe("list");
    if (list.t !== "list") return;
    expect(list.items.map((i) => i.level)).toEqual([0, 1, 2, 0]);
    const [ol] = parseMarkdown("1. x\n2. y\n");
    if (ol.t === "list") expect(ol.items.every((i) => i.ordered)).toBe(true);
    const [tasks] = parseMarkdown("- [ ] a\n- [x] b\n");
    if (tasks.t === "list") expect(tasks.items.map((i) => i.checked)).toEqual([false, true]);
  });

  it("parses tables with alignment", () => {
    const [t] = parseMarkdown("| A | B | C |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n");
    expect(t.t).toBe("table");
    if (t.t !== "table") return;
    expect(t.align).toEqual(["left", "center", "right"]);
    expect(t.rows).toHaveLength(1);
  });

  it("does not split table cells on pipes inside wikilinks or code", () => {
    expect(splitRow("| [[a|b]] | `x|y` | z |")).toEqual(["[[a|b]]", "`x|y`", "z"]);
  });

  it("keeps code fence content verbatim", () => {
    const [c] = parseMarkdown("```js\n# not heading\n- not list\n```");
    expect(c).toEqual({ t: "code", lang: "js", text: "# not heading\n- not list" });
  });

  it("parses callouts with default title and body", () => {
    const [c] = parseMarkdown("> [!tip]\n> body line");
    expect(c.t).toBe("callout");
    if (c.t !== "callout") return;
    expect(c.kind).toBe("tip");
    expect(c.title).toEqual([{ t: "text", text: "Tip" }]);
    expect(c.children[0].t).toBe("paragraph");
  });
});

describe("parseInline", () => {
  it("handles emphasis, code and links", () => {
    const n = parseInline("**b** *i* `c` [l](https://x.io)");
    expect(n.find((x) => x.t === "text" && x.bold)).toBeTruthy();
    expect(n.find((x) => x.t === "text" && x.italic)).toBeTruthy();
    expect(n.find((x) => x.t === "text" && x.code)).toBeTruthy();
    expect(n.find((x) => x.t === "link")).toMatchObject({ href: "https://x.io" });
  });

  it("does not treat snake_case as emphasis", () => {
    const n = parseInline("a snake_case_word here");
    expect(n).toEqual([{ t: "text", text: "a snake_case_word here" }]);
  });

  it("parses embeds with width and wikilink aliases", () => {
    expect(parseInline("![[pic.png|300]]")[0]).toMatchObject({ t: "image", src: "pic.png", width: 300 });
    expect(parseInline("[[Note#Head|shown]]")[0]).toMatchObject({ text: "shown" });
  });
});
