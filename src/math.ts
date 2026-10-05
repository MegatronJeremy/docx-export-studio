/**
 * Small LaTeX -> OMML (Office Math) converter. Pure TypeScript, no dependencies.
 * Covers the common academic subset; anything it does not understand throws,
 * and the exporter then falls back to the raw LaTeX in monospace.
 */

type Frag = { run: string; sty?: string } | { xml: string };

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ",
  varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  cdot: "⋅", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "∙", oplus: "⊕", otimes: "⊗",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝",
  ll: "≪", gg: "≫", infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃", nexists: "∄", emptyset: "∅", varnothing: "∅",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
  land: "∧", wedge: "∧", lor: "∨", vee: "∨", neg: "¬", lnot: "¬", to: "→", rightarrow: "→", leftarrow: "←", gets: "←",
  leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⟹", iff: "⟺", mapsto: "↦",
  uparrow: "↑", downarrow: "↓", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", angle: "∠", perp: "⊥", parallel: "∥",
  hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", aleph: "ℵ", prime: "′", degree: "°", therefore: "∴", because: "∵",
  langle: "⟨", rangle: "⟩", lbrace: "{", rbrace: "}", lvert: "|", rvert: "|", vert: "|", Vert: "‖", "|": "‖",
  "%": "%", "#": "#", "&": "&", _: "_", $: "$", "{": "{", "}": "}",
};

const FUNCS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "lg", "exp",
  "det", "dim", "ker", "deg", "gcd", "max", "min", "sup", "inf", "arg", "Pr", "mod", "lim", "limsup", "liminf",
]);

const NARY: Record<string, string> = { sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁" };
const LIMITS_BY_DEFAULT = new Set(["sum", "prod", "coprod", "bigcup", "bigcap", "bigoplus"]);

const ACCENTS: Record<string, string> = { hat: "̂", widehat: "̂", bar: "̄", vec: "⃗", tilde: "̃", widetilde: "̃", dot: "̇", ddot: "̈", check: "̌", acute: "́", grave: "̀" };

const BB: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", H: "ℍ" };

const MATRIX_DELIMS: Record<string, [string, string]> = {
  matrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"],
};

const SPACES = new Set([",", ";", ":", "!", " ", "quad", "qquad", "enspace", "thinspace"]);
const MAX_DEPTH = 40;

type Tok = { k: "cmd" | "ch" | "{" | "}" | "^" | "_" | "&" | "\\\\"; v: string };

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      const m = src.slice(i + 1).match(/^([A-Za-z]+\*?|.)/s);
      if (!m) throw new Error("dangling backslash");
      if (m[1] === "\\") out.push({ k: "\\\\", v: "\\\\" });
      else out.push({ k: "cmd", v: m[1].replace(/\*$/, "") });
      i += m[1].length;
    } else if (c === "{" || c === "}" || c === "^" || c === "_" || c === "&") out.push({ k: c, v: c });
    else if (/\s/.test(c)) continue;
    else out.push({ k: "ch", v: c });
  }
  return out;
}

function mergeRuns(frags: Frag[]): Frag[] {
  const out: Frag[] = [];
  for (const f of frags) {
    const last = out[out.length - 1];
    if ("run" in f && last && "run" in last && last.sty === f.sty) last.run += f.run;
    else out.push("run" in f ? { ...f } : f);
  }
  return out;
}

function runXml(text: string, sty?: string): string {
  const rpr = sty === "nor" ? "<m:rPr><m:nor/></m:rPr>" : sty ? `<m:rPr><m:sty m:val="${sty}"/></m:rPr>` : "";
  return `<m:r>${rpr}<m:t xml:space="preserve">${xmlEsc(text)}</m:t></m:r>`;
}

function render(frags: Frag[]): string {
  return mergeRuns(frags)
    .map((f) => ("run" in f ? runXml(f.run, f.sty) : f.xml))
    .join("");
}

class P {
  pos = 0;
  constructor(private t: Tok[], private depth = 0) {}

  private peek(): Tok | undefined {
    return this.t[this.pos];
  }

  /** Parse until `}`, `&`, `\\`, `\right`, `\end` (not consumed) or end. */
  list(): Frag[] {
    if (this.depth > MAX_DEPTH) throw new Error("too deeply nested");
    const out: Frag[] = [];
    for (;;) {
      const tk = this.peek();
      if (!tk || tk.k === "}" || tk.k === "&" || tk.k === "\\\\") break;
      if (tk.k === "cmd" && (tk.v === "right" || tk.v === "end")) break;
      if (tk.k === "^" || tk.k === "_") {
        // script with an empty base
        out.push(...this.scripts([{ run: "" }]));
        continue;
      }
      out.push(...this.scripts(this.atom()));
    }
    return out;
  }

  private group(): Frag[] {
    const tk = this.t[this.pos++];
    if (!tk) throw new Error("missing argument");
    if (tk.k === "{") {
      const inner = new P(this.t, this.depth + 1);
      inner.pos = this.pos;
      const r = inner.list();
      if (inner.t[inner.pos]?.k !== "}") throw new Error("unbalanced braces");
      this.pos = inner.pos + 1;
      return r;
    }
    if (tk.k === "cmd") {
      this.pos--;
      return this.atom();
    }
    if (tk.k === "ch") return [{ run: tk.v }];
    throw new Error("bad argument");
  }

  private scripts(base: Frag[]): Frag[] {
    let sub: Frag[] | undefined;
    let sup: Frag[] | undefined;
    for (;;) {
      const tk = this.peek();
      if (tk?.k === "_" && !sub) {
        this.pos++;
        sub = this.group();
      } else if (tk?.k === "^" && !sup) {
        this.pos++;
        sup = this.group();
      } else break;
    }
    if (!sub && !sup) return base;
    const last = base[base.length - 1];
    const head = base.slice(0, -1);
    const baseXml = render(last ? [last] : []);
    const e = `<m:e>${baseXml}</m:e>`;
    let xml: string;
    if (sub && sup) xml = `<m:sSubSup>${e}<m:sub>${render(sub)}</m:sub><m:sup>${render(sup)}</m:sup></m:sSubSup>`;
    else if (sub) xml = `<m:sSub>${e}<m:sub>${render(sub)}</m:sub></m:sSub>`;
    else xml = `<m:sSup>${e}<m:sup>${render(sup!)}</m:sup></m:sSup>`;
    return [...head, { xml }];
  }

  /** Operand of a big operator: everything up to the next top-level +, -, =, relation, comma or the end of the group. */
  private naryBody(): string {
    const out: Frag[] = [];
    for (;;) {
      const tk = this.peek();
      if (!tk || tk.k === "}" || tk.k === "&" || tk.k === "\\\\") break;
      if (tk.k === "cmd" && (tk.v === "right" || tk.v === "end")) break;
      if (tk.k === "ch" && /[+\-=<>,;]/.test(tk.v)) break;
      if (tk.k === "cmd" && (SYMBOLS[tk.v] ?? "").match(/^[≤≥≠≈≡→⇒⇔]$/)) break;
      out.push(...this.scripts(this.atom()));
    }
    return render(out);
  }

  private styled(sty: string): Frag[] {
    const inner = this.group();
    return inner.map((f) => ("run" in f ? { run: f.run, sty } : f));
  }

  private delimited(open: string, close: string, body: string): Frag {
    const chr = (v: string, tag: string) => `<m:${tag} m:val="${xmlEsc(v)}"/>`;
    return { xml: `<m:d><m:dPr>${chr(open, "begChr")}${chr(close, "endChr")}</m:dPr><m:e>${body}</m:e></m:d>` };
  }

  private delimChar(): string {
    const tk = this.t[this.pos++];
    if (!tk) throw new Error("missing delimiter");
    if (tk.k === "ch") return tk.v === "." ? "" : tk.v;
    if (tk.k === "cmd") {
      if (tk.v === ".") return "";
      if (tk.v in SYMBOLS) return SYMBOLS[tk.v];
      if (tk.v === "lceil") return "⌈";
      if (tk.v === "rceil") return "⌉";
      if (tk.v === "lfloor") return "⌊";
      if (tk.v === "rfloor") return "⌋";
    }
    throw new Error("bad delimiter");
  }

  private environment(name: string): Frag[] {
    const rows: Frag[][][] = [[[]]];
    const inner = new P(this.t, this.depth + 1);
    inner.pos = this.pos;
    for (;;) {
      const cell = inner.list();
      rows[rows.length - 1][rows[rows.length - 1].length - 1] = cell;
      const tk = inner.t[inner.pos];
      if (!tk) throw new Error("missing \\end");
      if (tk.k === "&") {
        inner.pos++;
        rows[rows.length - 1].push([]);
      } else if (tk.k === "\\\\") {
        inner.pos++;
        rows.push([[]]);
      } else if (tk.k === "cmd" && tk.v === "end") {
        inner.pos++;
        const n = inner.readName();
        if (n !== name) throw new Error(`\\end{${n}} does not match \\begin{${name}}`);
        break;
      } else throw new Error("unexpected token in environment");
    }
    this.pos = inner.pos;
    // drop a trailing empty row left by a final \\
    const last = rows[rows.length - 1];
    if (rows.length > 1 && last.length === 1 && last[0].length === 0) rows.pop();

    if (name in MATRIX_DELIMS) {
      const cols = Math.max(...rows.map((r) => r.length));
      const body =
        `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>` +
        rows.map((r) => `<m:mr>${Array.from({ length: cols }, (_, i) => `<m:e>${render(r[i] ?? [])}</m:e>`).join("")}</m:mr>`).join("") +
        `</m:m>`;
      const [o, c] = MATRIX_DELIMS[name];
      return [o || c ? this.delimited(o, c, body) : { xml: body }];
    }
    if (name === "cases") {
      const eq = `<m:eqArr>${rows.map((r) => `<m:e>${r.map((c) => render(c)).join(runXml("  "))}</m:e>`).join("")}</m:eqArr>`;
      return [this.delimited("{", "", eq)];
    }
    if (name === "aligned" || name === "align" || name === "gathered" || name === "split") {
      return [{ xml: `<m:eqArr>${rows.map((r) => `<m:e>${r.map((c) => render(c)).join("")}</m:e>`).join("")}</m:eqArr>` }];
    }
    throw new Error(`unsupported environment ${name}`);
  }

  private readName(): string {
    if (this.t[this.pos]?.k !== "{") throw new Error("expected {");
    this.pos++;
    let n = "";
    while (this.t[this.pos] && this.t[this.pos].k !== "}") n += this.t[this.pos++].v;
    if (!this.t[this.pos]) throw new Error("unbalanced braces");
    this.pos++;
    return n;
  }

  private atom(): Frag[] {
    const tk = this.t[this.pos++];
    if (!tk) throw new Error("unexpected end");
    if (tk.k === "ch") return [{ run: tk.v }];
    if (tk.k === "{") {
      this.pos--;
      return this.group();
    }
    if (tk.k !== "cmd") throw new Error(`unexpected ${tk.v}`);
    const c = tk.v;

    if (c in NARY) {
      let sub: Frag[] | undefined;
      let sup: Frag[] | undefined;
      for (;;) {
        const n = this.peek();
        if (n?.k === "_" && !sub) {
          this.pos++;
          sub = this.group();
        } else if (n?.k === "^" && !sup) {
          this.pos++;
          sup = this.group();
        } else break;
      }
      const loc = LIMITS_BY_DEFAULT.has(c) ? "undOvr" : "subSup";
      const hide = (v: Frag[] | undefined, n: string) => (v ? "" : `<m:${n}Hide m:val="1"/>`);
      const body = this.naryBody();
      return [
        {
          xml:
            `<m:nary><m:naryPr><m:chr m:val="${NARY[c]}"/><m:limLoc m:val="${loc}"/>${hide(sub, "sub")}${hide(sup, "sup")}</m:naryPr>` +
            `<m:sub>${sub ? render(sub) : ""}</m:sub><m:sup>${sup ? render(sup) : ""}</m:sup><m:e>${body}</m:e></m:nary>`,
        },
      ];
    }
    if (c === "frac" || c === "dfrac" || c === "tfrac" || c === "binom") {
      const num = this.group();
      const den = this.group();
      const pr = c === "binom" ? "<m:fPr><m:type m:val=\"noBar\"/></m:fPr>" : "";
      const f = `<m:f>${pr}<m:num>${render(num)}</m:num><m:den>${render(den)}</m:den></m:f>`;
      return [c === "binom" ? this.delimited("(", ")", f) : { xml: f }];
    }
    if (c === "sqrt") {
      let deg = "";
      if (this.peek()?.k === "ch" && this.peek()!.v === "[") {
        this.pos++;
        const d: Frag[] = [];
        while (this.peek() && !(this.peek()!.k === "ch" && this.peek()!.v === "]")) d.push(...this.atom());
        if (!this.peek()) throw new Error("unclosed [");
        this.pos++;
        deg = render(d);
      }
      const body = render(this.group());
      return [{ xml: deg ? `<m:rad><m:radPr/><m:deg>${deg}</m:deg><m:e>${body}</m:e></m:rad>` : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${body}</m:e></m:rad>` }];
    }
    if (c === "left") {
      const open = this.delimChar();
      const inner = new P(this.t, this.depth + 1);
      inner.pos = this.pos;
      const body = inner.list();
      const r = inner.t[inner.pos++];
      if (!r || r.k !== "cmd" || r.v !== "right") throw new Error("missing \\right");
      this.pos = inner.pos;
      const close = this.delimChar();
      return [this.delimited(open, close, render(body))];
    }
    if (c === "begin") {
      const name = this.readName();
      return this.environment(name);
    }
    if (c in ACCENTS) {
      return [{ xml: `<m:acc><m:accPr><m:chr m:val="${ACCENTS[c]}"/></m:accPr><m:e>${render(this.group())}</m:e></m:acc>` }];
    }
    if (c === "overline" || c === "underline") {
      return [{ xml: `<m:bar><m:barPr><m:pos m:val="${c === "overline" ? "top" : "bot"}"/></m:barPr><m:e>${render(this.group())}</m:e></m:bar>` }];
    }
    if (c === "text" || c === "mathrm" || c === "textrm" || c === "operatorname" || c === "mbox") return this.styled(c === "text" || c === "textrm" || c === "mbox" ? "nor" : "p");
    if (c === "mathbf" || c === "boldsymbol" || c === "bm" || c === "textbf") return this.styled("b");
    if (c === "mathit" || c === "textit") return this.styled("i");
    if (c === "mathbb") return this.group().map((f) => ("run" in f ? { run: [...f.run].map((ch) => BB[ch] ?? ch).join("") } : f));
    if (c === "mathcal" || c === "mathscr" || c === "mathfrak" || c === "mathsf" || c === "mathtt" || c === "displaystyle" || c === "textstyle") {
      return c === "displaystyle" || c === "textstyle" ? [] : this.group();
    }
    if (c === "limits" || c === "nolimits") return [];
    if (SPACES.has(c)) return [{ run: " " }];
    if (c === "lim" || c === "limsup" || c === "liminf" || c === "max" || c === "min" || c === "sup" || c === "inf") {
      if (this.peek()?.k === "_") {
        this.pos++;
        const lim = render(this.group());
        return [{ xml: `<m:limLow><m:e>${runXml(c, "p")}</m:e><m:lim>${lim}</m:lim></m:limLow>` }];
      }
      return [{ run: c, sty: "p" }];
    }
    if (FUNCS.has(c)) return [{ run: c, sty: "p" }];
    if (c in SYMBOLS) return [{ run: SYMBOLS[c] }];
    throw new Error(`unsupported command \\${c}`);
  }
}

/** Convert LaTeX math (without the surrounding $ signs) to an OMML `<m:oMath>` string. Throws on anything unsupported. */
export function latexToOmml(tex: string): string {
  const src = tex.trim();
  if (!src) throw new Error("empty math");
  if (src.length > 5000) throw new Error("math too long");
  const p = new P(tokenize(src));
  const frags = p.list();
  if (p.pos < (p as unknown as { t: Tok[] }).t.length) throw new Error("unexpected token");
  const body = render(frags);
  if (!body) throw new Error("empty math");
  return `<m:oMath>${body}</m:oMath>`;
}
