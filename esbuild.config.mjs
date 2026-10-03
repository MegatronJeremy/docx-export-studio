import esbuild from "esbuild";
import { builtinModules as builtins } from "node:module";
import fs from "node:fs";

// docx inlines a copy of jszip whose setImmediate polyfills probe createElement("script") (IE-era fallbacks).
// Obsidian's review rejects script-element creation, so these dead branches are cut (keeping the setTimeout fallback) at build time.
const SCRIPT_PROBES = [
  [/"document" in \w+ && "onreadystatechange" in \w+\.document\.createElement\("script"\) \? function\(\) \{[\s\S]*?\} : (function\(\) \{)/g, "$1"],
  [/\w+ && "onreadystatechange" in \w+\.createElement\("script"\) \? \([\s\S]*?\}\) : (function\(\w+\) \{)/g, "$1"],
];
const noScriptProbe = {
  name: "no-script-probe",
  setup(build) {
    build.onLoad({ filter: /node_modules[\\/]docx[\\/]dist[\\/]index\.(mjs|cjs)$/ }, (args) => {
      let code = fs.readFileSync(args.path, "utf8");
      for (const [probe, keep] of SCRIPT_PROBES) {
        if (!probe.test(code)) throw new Error("setImmediate polyfill pattern not found in docx; update esbuild.config.mjs: " + probe);
        code = code.replace(probe, keep);
      }
      return { contents: code, loader: "js" };
    });
  },
};

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  plugins: [noScriptProbe],
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2020",
  platform: "browser",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: false, // Obsidian policy: no obfuscation; keep readable
  treeShaking: true,
  outfile: "main.js",
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
