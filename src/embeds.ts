/** Note transclusion: inline `![[note]]`, `![[note#Heading]]` and `![[note#^block]]` before parsing. Pure, offline. */

export interface LoadedNote {
  /** Stable key for cycle detection (the vault path). */
  path: string;
  text: string;
}
export type NoteLoader = (link: string, fromPath: string) => Promise<LoadedNote | null>;

export const MAX_EMBED_DEPTH = 3;

const EMBED_LINE = /^\s*!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]\s*$/;
const FENCE = /^\s*(```|~~~)/;
const NON_NOTE_EXT = /\.(?!md$)[A-Za-z][A-Za-z0-9]{1,4}$/i;

function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
}

function plainLink(target: string): string {
  return `[[${target}]]`;
}

function headingLevel(line: string): { level: number; text: string } | null {
  const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

/** Lines of the section under `heading` (including the heading line), or null if absent. */
function sectionOf(lines: string[], heading: string): string[] | null {
  const want = heading.trim().toLowerCase();
  let inFence = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const h = headingLevel(lines[i]);
    if (!h) continue;
    if (start < 0) {
      if (h.text.toLowerCase() === want) {
        start = i;
        level = h.level;
      }
    } else if (h.level <= level) {
      return lines.slice(start, i);
    }
  }
  return start < 0 ? null : lines.slice(start);
}

/** The paragraph, list item or block carrying `^id` at its end, or null. */
function blockOf(lines: string[], id: string): string[] | null {
  const marker = new RegExp(`\\s\\^${id.replace(/[^\w-]/g, "")}\\s*$`);
  const idx = lines.findIndex((l) => marker.test(l));
  if (idx < 0) return null;
  let a = idx;
  if (!/^\s*([-*+]|\d+[.)])\s/.test(lines[idx])) while (a > 0 && lines[a - 1].trim() !== "") a--;
  return lines.slice(a, idx + 1).map((l, i, arr) => (i === arr.length - 1 ? l.replace(marker, "") : l));
}

async function expandLines(lines: string[], fromPath: string, load: NoteLoader, stack: string[]): Promise<string[]> {
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    const m = inFence ? null : EMBED_LINE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const target = m[1].trim();
    const hash = target.indexOf("#");
    const link = hash < 0 ? target : target.slice(0, hash);
    const frag = hash < 0 ? "" : target.slice(hash + 1).trim();
    if (link && NON_NOTE_EXT.test(link)) {
      out.push(line); // image / pdf / audio embed: handled elsewhere
      continue;
    }
    if (stack.length > MAX_EMBED_DEPTH) {
      out.push("", plainLink(target), "");
      continue;
    }
    const note = link ? await load(link, fromPath) : await load(fromPath, fromPath);
    if (!note || stack.includes(note.path)) {
      out.push("", plainLink(target), "");
      continue;
    }
    let body = stripFrontmatter(note.text).split(/\r?\n/);
    if (frag.startsWith("^")) body = blockOf(body, frag.slice(1)) ?? [];
    else if (frag) body = sectionOf(body, frag) ?? [];
    if (!body.length) {
      out.push("", plainLink(target), "");
      continue;
    }
    const inner = await expandLines(body, note.path, load, [...stack, note.path]);
    out.push("", ...inner, "");
  }
  return out;
}

/** Replace standalone embed lines with the embedded content (depth 3, cycles and missing targets become plain links). */
export async function expandEmbeds(markdown: string, fromPath: string, load: NoteLoader): Promise<string> {
  if (!markdown.includes("![[")) return markdown;
  const lines = await expandLines(markdown.split(/\r?\n/), fromPath, load, [fromPath]);
  return lines.join("\n");
}
