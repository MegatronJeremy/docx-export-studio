import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Block, Inline, ListItem } from "./ast";
import { imageInfo } from "./imagesize";
import { extractFootnotes, parseInline, parseMarkdown } from "./parser";
import { FreeGate, type ProGate, type ProOptions, type StylePreset } from "./pro";

export interface ExportOptions {
  /** Document title stored in the file properties. */
  title?: string;
  /** Return the bytes of an embedded image, or null if it cannot be found. Never fetches over the network. */
  resolveImage?: (src: string) => Promise<Uint8Array | null>;
  /** Pro gate. Defaults to FreeGate, which unlocks nothing. */
  gate?: ProGate;
  pro?: ProOptions;
}

type Child = Paragraph | Table;
type Run = TextRun | ExternalHyperlink | ImageRun | FootnoteReferenceRun;

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
  orderedRefs: string[] = [];
  /** Footnote id -> definition text; empty when Pro footnotes are off. */
  footnoteDefs = new Map<string, string>();
  /** Footnote number -> source text, in creation order. */
  footnoteBodies = new Map<number, string>();
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
            font: n.code ? CODE_FONT : undefined,
            shading: n.code ? { type: ShadingType.CLEAR, fill: "EFEFEF", color: "auto" } : undefined,
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
              children: [new TextRun({ text: l, font: CODE_FONT, size: 19 })],
              spacing: { after: 0, line: 240 },
              ...this.wrapProps({ left: wrap?.left ?? 0, fill: "F2F2F2", border: wrap?.border }),
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
    const ref = `ol-${this.orderedRefs.length}`;
    let usedOrdered = false;
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
      if (it.ordered) usedOrdered = true;
      out.push(
        new Paragraph({
          children,
          numbering: { reference: it.ordered ? ref : "bullets", level: it.level },
          spacing: { after: 40 },
          ...(wrap?.fill ? this.wrapProps({ left: 0, fill: wrap.fill }) : {}),
        }),
      );
    }
    if (usedOrdered) this.orderedRefs.push(ref);
    return out;
  }

  private async table(b: Extract<Block, { t: "table" }>): Promise<Table> {
    const cols = Math.max(b.header.length, 1);
    const cell = async (c: Inline[], i: number, head: boolean) =>
      new TableCell({
        children: [
          new Paragraph({
            children: await this.inlines(c, { bold: head }),
            alignment:
              b.align[i] === "center" ? AlignmentType.CENTER : b.align[i] === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          }),
        ],
        width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
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
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    });
  }
}

function numberingConfig(orderedRefs: string[]) {
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
    ...orderedRefs.map((reference) => ({
      reference,
      levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`),
    })),
  ];
}

const PAGE = { A4: { width: 11906, height: 16838 }, Letter: { width: 12240, height: 15840 } };

function headingDefaults(p: StylePreset) {
  const font = p.headingFont ?? p.font;
  const mk = (pt: number, before: number) => ({
    run: { font, size: Math.round(pt * 2), bold: true, color: p.headingColor },
    paragraph: { spacing: { before, after: 120 } },
  });
  return {
    heading1: mk(p.sizePt + 9, 360),
    heading2: mk(p.sizePt + 5, 240),
    heading3: mk(p.sizePt + 3, 200),
    heading4: mk(p.sizePt + 1, 160),
    heading5: mk(p.sizePt, 160),
    heading6: mk(p.sizePt, 160),
  };
}

/** Convert Markdown (Obsidian flavour) to the bytes of a .docx file. Runs fully offline. */
export async function exportToDocx(markdown: string, opts: ExportOptions = {}): Promise<Uint8Array> {
  const gate = opts.gate ?? new FreeGate();
  const pro = opts.pro ?? {};
  const preset = gate.has("templates") ? pro.preset : undefined;
  const useFootnotes = gate.has("footnotes") && !!pro.footnotes;
  const hf = gate.has("headerFooter");

  const builder = new Builder(opts);
  let source = markdown;
  if (useFootnotes) {
    const x = extractFootnotes(markdown);
    source = x.text;
    builder.footnoteDefs = x.defs;
  }
  const children = await builder.blocks(parseMarkdown(source));

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
  const doc = new Document({
    creator: "DOCX Export Studio",
    title: opts.title,
    styles: {
      default: {
        document: {
          run: { font, size: Math.round((preset?.sizePt ?? 11) * 2) },
          paragraph: preset ? { spacing: { line: Math.round(preset.lineSpacing * 240) } } : undefined,
        },
        ...(preset ? headingDefaults(preset) : {}),
      },
    },
    numbering: { config: numberingConfig(builder.orderedRefs) },
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
          : {},
        headers,
        footers,
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
