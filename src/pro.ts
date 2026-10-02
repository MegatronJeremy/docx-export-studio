/**
 * Pro gate. Every Pro feature asks `gate.has(feature)` before it runs. The free build uses
 * `FreeGate` (always false); after a successful licence check (src/license.ts) the plugin
 * uses `UnlockedGate`. No Pro code touches the network.
 */
export type ProFeature = "templates" | "footnotes" | "batch" | "headerFooter";

export interface ProGate {
  has(feature: ProFeature): boolean;
}

export class FreeGate implements ProGate {
  has(_feature: ProFeature): boolean {
    return false;
  }
}

export class UnlockedGate implements ProGate {
  has(_feature: ProFeature): boolean {
    return true;
  }
}

/** A named set of document styles (Pro: "templates"). */
export interface StylePreset {
  id: string;
  name: string;
  font: string;
  /** Body size in points. */
  sizePt: number;
  /** Heading font; defaults to `font`. */
  headingFont?: string;
  /** Heading colour, RRGGBB without #. */
  headingColor: string;
  /** Line spacing multiplier (1 = single). */
  lineSpacing: number;
  /** Page margins in inches. */
  marginIn: number;
  page: "A4" | "Letter";
}

/** Options for Pro-only behaviour. Ignored by the exporter unless the gate allows them. */
export interface ProOptions {
  preset?: StylePreset;
  /** Render [^1] footnotes as real .docx footnotes. */
  footnotes?: boolean;
  header?: string;
  footer?: string;
  pageNumbers?: boolean;
}

export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  templates: "Style presets (built-in and your own)",
  footnotes: "Real footnotes (native .docx footnotes)",
  batch: "Batch / folder export",
  headerFooter: "Header, footer and page numbers",
};

export const BUILTIN_PRESETS: StylePreset[] = [
  { id: "default", name: "Default (Calibri 11)", font: "Calibri", sizePt: 11, headingColor: "2F5496", lineSpacing: 1.15, marginIn: 1, page: "Letter" },
  { id: "academic", name: "Academic (Times 12, double-spaced)", font: "Times New Roman", sizePt: 12, headingColor: "000000", lineSpacing: 2, marginIn: 1, page: "Letter" },
  { id: "business", name: "Business (Arial 11, A4)", font: "Arial", sizePt: 11, headingColor: "1F3864", lineSpacing: 1.15, marginIn: 1, page: "A4" },
  { id: "compact", name: "Compact (Calibri 10)", font: "Calibri", sizePt: 10, headingColor: "404040", lineSpacing: 1, marginIn: 0.75, page: "A4" },
];

export function findPreset(id: string, custom: StylePreset[]): StylePreset | undefined {
  return [...custom, ...BUILTIN_PRESETS].find((p) => p.id === id);
}

/** Clamp user-entered preset values to sane ranges and fall back for bad input. */
export function sanitizePreset(p: Partial<StylePreset> & { id: string; name: string }): StylePreset {
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const hex = (v: unknown, d: string) => (typeof v === "string" && /^#?[0-9a-fA-F]{6}$/.test(v) ? v.replace("#", "").toUpperCase() : d);
  const font = (v: unknown, d: string) => (typeof v === "string" && /^[\w .-]{1,60}$/.test(v.trim()) && v.trim() ? v.trim() : d);
  return {
    id: p.id,
    name: p.name,
    font: font(p.font, "Calibri"),
    sizePt: num(p.sizePt, 6, 24, 11),
    headingFont: p.headingFont ? font(p.headingFont, "") || undefined : undefined,
    headingColor: hex(p.headingColor, "2F5496"),
    lineSpacing: num(p.lineSpacing, 1, 3, 1.15),
    marginIn: num(p.marginIn, 0.25, 3, 1),
    page: p.page === "A4" ? "A4" : "Letter",
  };
}
