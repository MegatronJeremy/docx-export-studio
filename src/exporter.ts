import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  TableOfContents,
  ImageRun,
  ImportedXmlComponent,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Block, Inline, ListItem } from "./ast";
import { expandEmbeds, type NoteLoader } from "./embeds";
import { latexToOmml } from "./math";
import { imageInfo } from "./imagesize";
import { extractFootnotes, parseInline, parseMarkdown } from "./parser";
import { FreeGate, type ProGate, type ProOptions, type StylePreset } from "./pro";

export interface ExportOptions {
  /** Document title stored in the file properties. */
  title?: string;
  /** Return the bytes of an embedded image, or null if it cannot be found. Never fetches over the network. */
  resolveImage?: (src: string) => Promise<Uint8Array | null>;
  /** Load another note for `![[note]]` embeds. Without it, embeds are left unexpanded. */
  resolveNote?: NoteLoader;
  /** Vault path of the exported note (cycle guard and relative link base). */
  sourcePath?: string;
  /** Pro gate. Defaults to FreeGate, which unlocks nothing. */
  gate?: ProGate;
  pro?: ProOptions;
  /** Free-tier page setup. A Pro preset, when active, overrides it. Default A4, normal margins. */
  page?: { size?: "A4" | "Letter"; margins?: "normal" | "narrow" };
  /** Insert a Word table-of-contents field (headings 1-4) at the top. A `[[toc]]` or `%% toc %%` line in the note also turns it on. */
  toc?: boolean;
}

type Child = Paragraph | Table;
const MAX_NUMBERED_LISTS = 250;
/** Beyond this the docx library needs >2 GB and minutes (perf.md): refuse with a clear message instead of freezing Obsidian. */
export const MAX_SOURCE_CHARS = 2_500_000;
const NUMBERING_BUDGET = 5e7; // ordered lists x source characters
type Run = TextRun | ExternalHyperlink | ImageRun | FootnoteReferenceRun | ImportedXmlComponent;

interface Wrap {
  left: number; // extra left indent, twips
  border?: string; // left bar colour
  fill?: string; // background colour
}

const MAX_IMAGE_PX = 600; // 6.25in at 96dpi, fits Letter/A4 with 1in margins
const CODE_FONT = "Consolas";

const CALLOUT_COLORS: Record<string, [string, string]> = {
  note: ["2F6FDE", "EAF1FD"],
  info: ["2F6FDE", "EAF1FD"],
  todo: ["2F6FDE", "EAF1FD"],
  abstract: ["1BA5B8", "E6F6F8"],
  summary: ["1BA5B8", "E6F6F8"],
  tip: ["1BA5B8", "E6F6F8"],
  success: ["2E9E4F", "E8F6EC"],
  check: ["2E9E4F", "E8F6EC"],
  done: ["2E9E4F", "E8F6EC"],
  question: ["D98A00", "FDF3E1"],
  help: ["D98A00", "FDF3E1"],
  warning: ["D98A00", "FDF3E1"],
  caution: ["D98A00", "FDF3E1"],
  attention: ["D98A00", "FDF3E1"],
  failure: ["D13B3B", "FBE9E9"],
  fail: ["D13B3B", "FBE9E9"],
  danger: ["D13B3B", "FBE9E9"],
  error: ["D13B3B", "FBE9E9"],
  bug: ["D13B3B", "FBE9E9"],
  quote: ["808080", "F3F3F3"],
  cite: ["808080", "F3F3F3"],
  example: ["7A4FD1", "F0EBFB"],
};

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

class Builder {
  orderedCount = 0;
  maxNumbered = MAX_NUMBERED_LISTS;
  /** Footnote id -> definition text; empty when Pro footnotes are off. */
  footnoteDefs = new Map<string, string>();
  /** Footnote number -> source text, in creation order. */
  footnoteBodies = new Map<number, string>();
  /** Text width in twips (page minus margins); tables are sized to it. */
  textWidth = 9026;
  constructor(private opts: ExportOptions) {}

  async inlines(list: Inline[], extra: { bold?: boolean } = {}): Promise<Run[]> {
    const runs: Run[] = [];
    for (const n of list) {
      if (n.t === "text") {
        runs.push(
          new TextRun({
            text: n.text,
            bold: n.bold || extra.bold || undefined,
            italics: n.italic || undefined,
            strike: n.strike || undefined,
            highlight: n.highlight ? "yellow" : undefined,
            style: n.code ? "InlineCode" : undefined,
          }),
        );
      } else if (n.t === "fnref") {
        const body = this.footnoteDefs.get(n.id);
        if (body === undefined) {
          runs.push(new TextRun({ text: `[^${n.id}]` }));
        } else {
          const num = this.footnoteBodies.size + 1;
          this.footnoteBodies.set(num, body);
          runs.push(new FootnoteReferenceRun(num));
        }
      } else if (n.t === "math") {
        runs.push(this.math(n.tex, false));
      } else if (n.t === "break") {
        runs.push(new TextRun({ break: 1 }));
      } else if (n.t === "link") {
        if (/^(https?:|mailto:)/i.test(n.href)) {
          const text = n.children.map((c) => (c.t === "text" ? c.text : "")).join("") || n.href;
          runs.push(
            new ExternalHyperlink({
              link: n.href,
              children: [new TextRun({ text, color: "0563C1", underline: {}, bold: extra.bold || undefined })],
            }),
          );
        } else {
          runs.push(...(await this.inlines(n.children, extra))); // relative/obsidian link: keep the text only
        }
      } else if (n.t === "image") {
        runs.push(await this.image(n));
      }
    }
    return runs;
  }

  /** Native Word equation; falls back to the raw LaTeX in monospace if it cannot be converted. */
  private math(tex: string, display: boolean): Run {
    try {
      const xml = latexToOmml(tex);
      const ns = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
      const wrapped = display ? xml.replace("<m:oMath>", "<m:oMathPara><m:oMath>").replace(/<\/m:oMath>$/, "</m:oMath></m:oMathPara>") : xml;
      return ImportedXmlComponent.fromXmlString(wrapped.replace(/^<m:(\w+)/, `<m:$1 ${ns}`));
    } catch {
      return new TextRun({ text: display ? tex.trim() : `$${tex}$`, font: CODE_FONT, shading: { type: ShadingType.CLEAR, fill: "EFEFEF", color: "auto" } });
    }
  }

  private async image(n: Extract<Inline, { t: "image" }>): Promise<Run> {
    const bytes = /^https?:/i.test(n.src) ? null : await this.opts.resolveImage?.(n.src);
    const info = bytes ? imageInfo(bytes) : null;
    if (!bytes || !info) {
      const why = /^https?:/i.test(n.src) ? "remote image not downloaded" : bytes ? "unsupported image type" : "image not found";
      return new TextRun({ text: `[${why}: ${n.alt || n.src}]`, italics: true, color: "808080" });
    }
    let w = n.width ?? info.width;
    let h = n.width ? Math.round((n.width * info.height) / info.width) : info.height;
    if (w > MAX_IMAGE_PX) {
      h = Math.round((h * MAX_IMAGE_PX) / w);
      w = MAX_IMAGE_PX;
    }
    return new ImageRun({
      type: info.kind,
      data: bytes,
      transformation: { width: Math.max(w, 1), height: Math.max(h, 1) },
      altText: { name: n.alt || n.src, title: n.alt || n.src, description: n.alt || n.src },
    });
  }

  private wrapProps(w?: Wrap) {
    if (!w) return {};
    return {
      indent: w.left ? { left: w.left } : undefined,
      border: w.border
        ? { left: { style: BorderStyle.SINGLE, size: 24, color: w.border, space: 8 } }
        : undefined,
      shading: w.fill ? { type: ShadingType.CLEAR, fill: w.fill, color: "auto" } : undefined,
    };
  }

  async blocks(list: Block[], wrap?: Wrap): Promise<Child[]> {
    const out: Child[] = [];
    for (const b of list) out.push(...(await this.block(b, wrap)));
    return out;
  }

  private async block(b: Block, wrap?: Wrap): Promise<Child[]> {
    switch (b.t) {
      case "heading":
        return [new Paragraph({ heading: HEADINGS[b.level - 1], children: await this.inlines(b.content), ...this.wrapProps(wrap) })];
      case "paragraph":
        return [new Paragraph({ children: await this.inlines(b.content), spacing: { after: 120 }, ...this.wrapProps(wrap) })];
      case "math":
        return [new Paragraph({ children: [this.math(b.tex, true)], spacing: { after: 120 }, ...this.wrapProps(wrap) })];
      case "hr":
        return [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
            spacing: { after: 120 },
          }),
        ];
      case "code": {
        const lines = b.text === "" ? [""] : b.text.split("\n");
        return lines.map(
          (l) =>
            new Paragraph({
              style: "CodeBlock",
              children: [new TextRun({ text: l })],
              ...this.wrapProps({ left: wrap?.left ?? 0, border: wrap?.border }),
            }),
        );
      }
      case "quote":
        return this.blocks(b.children, { left: (wrap?.left ?? 0) + 360, border: "A0A0A0" });
      case "callout": {
        const [bar, fill] = CALLOUT_COLORS[b.kind] ?? CALLOUT_COLORS.note;
        const w: Wrap = { left: (wrap?.left ?? 0) + 120, border: bar, fill };
        const title = new Paragraph({ children: await this.inlines(b.title, { bold: true }), spacing: { after: 60 }, ...this.wrapProps(w) });
        return [title, ...(await this.blocks(b.children, w)), new Paragraph({ spacing: { after: 60 } })];
      }
      case "list":
        return this.list(b.items, wrap);
      case "table":
        return [await this.table(b), new Paragraph({ spacing: { after: 120 } })];
    }
  }

  private async list(items: ListItem[], wrap?: Wrap): Promise<Child[]> {
    const out: Child[] = [];
    // One shared abstract numbering ("ol"); each list gets its own instance so numbering restarts at 1.
    const instance = this.orderedCount;
    let usedOrdered = false;
    // docx's packer rewrites every numbering placeholder over the whole document (cost ~ lists x size),
    // so past MAX_NUMBERED_LISTS ordered lists we write the numbers as literal text instead.
    const literal = this.orderedCount >= this.maxNumbered;
    const counters: number[] = [];
    for (const it of items) {
      const children = await this.inlines(it.content);
      if (it.checked !== undefined) {
        out.push(
          new Paragraph({
            children: [new TextRun({ text: it.checked ? "☑ " : "☐ ", font: "Segoe UI Symbol" }), ...children],
            indent: { left: (wrap?.left ?? 0) + 360 * (it.level + 1) },
            spacing: { after: 40 },
          }),
        );
        continue;
      }
      if (it.ordered && literal) {
        counters.length = it.level + 1;
        counters[it.level] = (counters[it.level] ?? 0) + 1;
        usedOrdered = true;
        out.push(
          new Paragraph({
            children: [new TextRun({ text: `${counters[it.level]}. ` }), ...children],
            indent: { left: (wrap?.left ?? 0) + 360 * (it.level + 1), hanging: 260 },
            spacing: { after: 40 },
            ...(wrap?.fill ? this.wrapProps({ left: wrap.left ?? 0, fill: wrap.fill }) : {}),
          }),
        );
        continue;
      }
      if (it.ordered) usedOrdered = true;
      out.push(
        new Paragraph({
          children,
          numbering: it.ordered ? { reference: "ol", level: it.level, instance } : { reference: "bullets", level: it.level },
          spacing: { after: 40 },
          ...(wrap?.fill ? this.wrapProps({ left: 0, fill: wrap.fill }) : {}),
        }),
      );
    }
    if (usedOrdered) this.orderedCount++;
    return out;
  }

  private async table(b: Extract<Block, { t: "table" }>): Promise<Table> {
    const cols = Math.max(b.header.length, 1);
    const colW = Math.floor(this.textWidth / cols);
    const columnWidths = Array.from({ length: cols }, () => colW);
    const cell = async (c: Inline[], i: number, head: boolean) =>
      new TableCell({
        children: [
          new Paragraph({
            children: await this.inlines(c, { bold: head }),
            alignment:
              b.align[i] === "center" ? AlignmentType.CENTER : b.align[i] === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          }),
        ],
        width: { size: colW, type: WidthType.DXA },
        shading: head ? { type: ShadingType.CLEAR, fill: "E7EAF0", color: "auto" } : undefined,
        margins: { top: 40, bottom: 40, left: 100, right: 100 },
      });
    const rows: TableRow[] = [
      new TableRow({ tableHeader: true, children: await Promise.all(b.header.map((c, i) => cell(c, i, true))) }),
    ];
    for (const r of b.rows) rows.push(new TableRow({ children: await Promise.all(r.map((c, i) => cell(c, i, false))) }));
    const line = { style: BorderStyle.SINGLE, size: 4, color: "9AA0A6" };
    return new Table({
      rows,
      width: { size: colW * cols, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    });
  }
}

function numberingConfig(hasOrdered: boolean) {
  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format,
      text: text(level),
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
    }));
  return [
    { reference: "bullets", levels: levels(LevelFormat.BULLET, (l) => (l % 2 === 0 ? "•" : "◦")) },
    ...(hasOrdered ? [{ reference: "ol", levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) }] : []),
  ];
}

const PAGE = { A4: { width: 11906, height: 16838 }, Letter: { width: 12240, height: 15840 } };

function headingDefaults(p?: StylePreset) {
  const font = p ? p.headingFont ?? p.font : "";
  const mk = (level: number, pt: number, before: number) => ({
    ...(p ? { run: { font, size: Math.round(pt * 2), bold: true, color: p.headingColor } } : {}),
    paragraph: { ...(p ? { spacing: { before, after: 120 } } : {}), outlineLevel: level },
  });
  const s = p?.sizePt ?? 11;
  return {
    heading1: mk(0, s + 9, 360),
    heading2: mk(1, s + 5, 240),
    heading3: mk(2, s + 3, 200),
    heading4: mk(3, s + 1, 160),
    heading5: mk(4, s, 160),
    heading6: mk(5, s, 160),
  };
}

/** `title` and `author` from a leading YAML block (plain scalars or a one-item list only); nothing else is read. */
function frontmatterProps(md: string): { title?: string; author?: string } {
  const m = md.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return {};
  const out: { title?: string; author?: string } = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(title|author):[ \t]*(.*)$/i);
    if (!kv) continue;
    let v = kv[2].trim();
    if (!v) {
      const li = (lines[i + 1] ?? "").match(/^\s*-\s+(.+)$/);
      if (li) v = li[1].trim();
    }
    if (/^\[[^\[].*\]$/.test(v)) v = v.slice(1, -1).split(/\s*,\s*/)[0];
    v = v.replace(/^(["'])(.*)\1$/, "$2").replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").trim();
    if (v) out[kv[1].toLowerCase() as "title" | "author"] = v.slice(0, 200);
  }
  return out;
}

/** Convert Markdown (Obsidian flavour) to the bytes of a .docx file. Runs fully offline. */
export async function exportToDocx(markdown: string, opts: ExportOptions = {}): Promise<Uint8Array> {
  const gate = opts.gate ?? new FreeGate();
  const pro = opts.pro ?? {};
  const preset = gate.has("templates") ? pro.preset : undefined;
  const useFootnotes = gate.has("footnotes") && !!pro.footnotes;
  const hf = gate.has("headerFooter");

  const builder = new Builder(opts);
  {
    const pg = preset ? PAGE[preset.page] : PAGE[opts.page?.size === "Letter" ? "Letter" : "A4"];
    const m = preset ? preset.marginIn * 1440 : opts.page?.margins === "narrow" ? 720 : 1440;
    builder.textWidth = pg.width - 2 * m;
  }
  builder.maxNumbered = Math.max(10, Math.min(MAX_NUMBERED_LISTS, Math.floor(NUMBERING_BUDGET / Math.max(markdown.length, 1))));
  let source = markdown;
  if (opts.resolveNote) source = await expandEmbeds(source, opts.sourcePath ?? "", opts.resolveNote);
  if (source.length > MAX_SOURCE_CHARS)
    throw new Error(`Note is too large to export safely (${(source.length / 1e6).toFixed(1)} MB, limit ${MAX_SOURCE_CHARS / 1e6} MB). Split it into smaller notes.`);
  if (useFootnotes) {
    const x = extractFootnotes(source);
    source = x.text;
    builder.footnoteDefs = x.defs;
  }
  const tocRe = /^[ \t]*(?:\[\[toc\]\]|%%\s*toc\s*%%)[ \t]*$/gim;
  const wantToc = !!opts.toc || tocRe.test(source);
  source = source.replace(tocRe, "");
  const children: (Paragraph | Table | TableOfContents)[] = await builder.blocks(parseMarkdown(source));
  if (wantToc) children.unshift(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-4" }));

  const footnotes: Record<number, { children: Paragraph[] }> = {};
  for (const [num, body] of builder.footnoteBodies) {
    const noRefs = parseInline(body).map((n) => (n.t === "fnref" ? ({ t: "text" as const, text: `[^${n.id}]` }) : n));
    footnotes[num] = { children: [new Paragraph({ children: await builder.inlines(noRefs) })] };
  }

  const text = (t: string) => new Paragraph({ children: [new TextRun({ text: t, size: 18, color: "595959" })] });
  const headers = hf && pro.header ? { default: new Header({ children: [text(pro.header)] }) } : undefined;
  const footerKids: Paragraph[] = [];
  if (hf && pro.footer) footerKids.push(text(pro.footer));
  if (hf && pro.pageNumbers)
    footerKids.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 18, color: "595959" }),
        ],
      }),
    );
  const footers = footerKids.length ? { default: new Footer({ children: footerKids }) } : undefined;

  const font = preset?.font ?? "Calibri";
  const fm = frontmatterProps(markdown);
  const doc = new Document({
    creator: fm.author ?? "DOCX Export Studio",
    title: fm.title ?? opts.title,
    styles: {
      default: {
        document: {
          run: { font, size: Math.round((preset?.sizePt ?? 11) * 2) },
          paragraph: preset ? { spacing: { line: Math.round(preset.lineSpacing * 240) } } : undefined,
        },
        ...headingDefaults(preset),
      },
      paragraphStyles: [
        {
          id: "CodeBlock",
          name: "Code Block",
          basedOn: "Normal",
          quickFormat: true,
          run: { font: CODE_FONT, size: 19 },
          paragraph: { spacing: { after: 0, line: 240 }, shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" } },
        },
      ],
      characterStyles: [
        {
          id: "InlineCode",
          name: "Inline Code",
          quickFormat: true,
          run: { font: CODE_FONT, shading: { type: ShadingType.CLEAR, fill: "EFEFEF", color: "auto" } },
        },
      ],
    },
    features: wantToc ? { updateFields: true } : undefined,
    numbering: { config: numberingConfig(builder.orderedCount > 0) },
    footnotes: Object.keys(footnotes).length ? footnotes : undefined,
    sections: [
      {
        properties: preset
          ? {
              page: {
                size: PAGE[preset.page],
                margin: { top: preset.marginIn * 1440, bottom: preset.marginIn * 1440, left: preset.marginIn * 1440, right: preset.marginIn * 1440 },
              },
            }
          : {
              page: {
                size: PAGE[opts.page?.size === "Letter" ? "Letter" : "A4"],
                margin: (() => {
                  const m = opts.page?.margins === "narrow" ? 720 : 1440;
                  return { top: m, bottom: m, left: m, right: m };
                })(),
              },
            },
        headers,
        footers,
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
