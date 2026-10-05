# What has been tested

Written by Quillfern (AI-assisted), an AI-assisted studio. Version 0.1.0 record below; see the 0.1.1 section at the end.

## 1. Automated checks

- `npm ci`, `npm run typecheck`, `npm test` (44 tests) and `npm run build` pass.
- Tests use Markdown fixtures and inspect the generated `.docx` XML (headings, lists, tables, images, footnotes, headers and footers, presets).
- Two tests open the exported `.docx` in LibreOffice 6.4.7.2 (headless) and convert it to PDF and text.
- The valid-key and refunded-key paths are tested against simulated Gumroad responses only.

## 2. Run in Obsidian (version 0.1.0)

- App: Obsidian 1.13.7, Linux desktop.
- Build: `main.js` sha256 `bf84e5b9f13280745c10b92e9ecffcc113cf8e846269a3822e4e3440b182eaaf`; `manifest.json` sha256 `b8005bbf68946f83dad2be3f00f5c1a717c9e0a25fa8f621535b99cde27415e3`. Both were loaded byte-identical.
- Items that ran and passed:
  - Built-in "Academic" preset export (Times New Roman 12 pt, double spacing, Letter).
  - Creating, saving, selecting and exporting a custom preset (Georgia 13 pt, 1.5 spacing, A4, 1.25 in margins).
  - The "How to get Pro" link in settings: one click made Obsidian open the README anchor URL.
  - Verify with an invalid key against the live Gumroad service: notice "Gumroad does not recognise this licence key.", nothing saved, Pro stayed off. The button was pressed twice; the network log shows one connection to api.gumroad.com and no other traffic.
  - Footnotes, header/footer with page numbers, and folder (batch) export.
- Pro features (presets, footnotes, header/footer, batch) were exercised with the Pro state forced on, not with a licence key.

## 3. Not covered

- Microsoft Word: output has not been opened in Word. Spacing and the task-list checkbox font may differ.
- The exported files were converted to PDF in LibreOffice, but the PDFs were not viewed.
- Batch export with subfolders was not exercised.
- Windows, macOS and mobile (the plugin is desktop-only).
- A real valid licence key and a refunded key against the live service. Pro is now on sale, so the first paying buyers are this test.
- Minimum Obsidian version 1.5.0 is an estimate; only 1.13.7 was used.
- Obsidian-specific syntax such as Dataview and Mermaid is not specially handled. (Embedded notes and math were not handled up to 0.1.2; see the 0.1.3 section.)

## Version 0.1.1 (added 2026-10-03)

What changed from 0.1.0, in plain words: build settings and heading text only. The build now replaces two unused script-injection fallbacks bundled in a dependency (jszip's setImmediate polyfill) so `main.js` contains no `createElement("script")`; the `builtin-modules` package was replaced by Node's `node:module`; and the settings headings are now "Pro upgrade", "Pro features" and "Custom preset" (set with `setHeading()`). No new network path: the only network call is still the Gumroad licence check.

- `npm run test` (via the SkyNet run_product_checks sandbox) on this exact source, 2026-10-03: 44 tests passed.
- Release build 0.1.1: `main.js` sha256 `51d195fee719f2a3be01fb3df3251f4b98fb69d4d5aa26d33a32a6bba831007b`; `manifest.json` sha256 `c1e1d405148be3204946bc05200d2b33749d2c7ad35b043d32b17733d60f0498`. A search of this `main.js` finds no `createElement("script")`.
- Not done: the run in Obsidian (section 2) was on 0.1.0 and has not been repeated on 0.1.1.

## Version 0.1.2 (added 2026-10-05)
- Change: the settings link "How to get Pro" now points to the Gumroad page (utm-tagged) instead of the README, its text is now "How to get Pro (one-time purchase on Gumroad, opens in your browser)", and the README top now says Pro is a paid option. No other code change.
- Checks: typecheck, 44 automated tests and build pass (run_product_checks, 2026-10-05).
- Release build 0.1.2: `main.js` sha256 `01619b816e1d58d923eb0aea81eb32a8d54e324ff084a526bea236d47a6269cf`; `manifest.json` sha256 `d2f9b1a2690c6ef6e95221da36ad136445f938955d0750ab68acc609b400bb8b`.
- Not done: the run in Obsidian (section 2) was on 0.1.0 and has not been repeated on 0.1.2.

## Version 0.1.3 (added 2026-10-05)

What changed from 0.1.2 (code and README; nothing about the Gumroad link or the single network call changed):

- Right-click menu: "Export to .docx" on a note in the file explorer (file-menu) and in the editor (editor-menu). The folder entry for Pro batch export is unchanged.
- Math: `$...$` and `$$...$$` are converted to native Word equations (OMML) for a common LaTeX subset; unsupported LaTeX falls back to monospace source; currency like `$5 and $6` stays text (test/math.test.ts, 10 tests).
- Note embeds `![[Note]]`, `![[Note#Heading]]`, `![[Note#^block]]` are inlined up to 3 levels, cycles and missing notes become plain text (test/regression.test.ts).
- Syntax regression fixes: setext headings, `[/]` and `[-]` task states shown as unchecked boxes, HTML comments dropped, Obsidian `%%` comments and block ids not leaked, 22 regression tests (test/regression.test.ts, test/obsidian-syntax.test.ts).
- Free page setup: A4 (default) or US Letter, normal or narrow margins (test/pagesetup.test.ts). A Pro preset still sets its own page size and margins.
- Optional table of contents (setting or `[[toc]]` line), Word field with updateFields (test/toc.test.ts).
- Headings are exported as Word Heading 1-6 styles with outline levels; code uses named styles "Code Block" and "Inline Code"; tables use fixed column widths from the page text width (test/exporter.test.ts, test/tables.test.ts).
- Frontmatter is never printed; title and author go into the file properties (test/frontmatter.test.ts). Local images, sizes and placeholders (test/images.test.ts). Large notes: 1500 ordered lists export fast (test/perf.test.ts).
- Pro: inline `^[...]` footnotes in addition to `[^1]` (test/pro.test.ts); an offline "Re-check" keeps Pro and the key for a paying user, and only a definite answer from Gumroad changes the state (test/pro-unlock.test.ts, simulated Gumroad responses only).

Checks on this exact source, run with the SkyNet run_product_checks sandbox on 2026-10-05: `npm ci`, `npm run typecheck`, `npm run test` (15 test files, 115 tests passed) and `npm run build` all passed. The LibreOffice 6.4.7.2 checks inside the tests (export opens and converts to PDF and text, Pro footnote markers, table cell text) passed. Math was checked in LibreOffice only, not in Word.

Release build 0.1.3: `main.js` sha256 `8dd578c94ffa77a7f4b4225ccbbf04d105df8a820273789bd623bd29f8ebc200`; `manifest.json` sha256 `689925dd178e6a2a7880d5c92a6269f43a65367c77d1f8ca49fa60fd731966b7`. A search of this `main.js` finds no `createElement("script")`.

Not done: version 0.1.3 was not run in Obsidian (section 2 was on 0.1.0 only). In particular the new right-click menu entries, the page and table-of-contents settings and the offline Re-check have only automated-test and type-check evidence. Not tested in Word.
