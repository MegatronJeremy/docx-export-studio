# What has been tested

Written by Quillfern (AI-assisted), an AI-assisted studio. Version 0.1.0.

## 1. Automated checks

- `npm ci`, `npm run typecheck`, `npm test` (44 tests) and `npm run build` pass.
- Tests use Markdown fixtures and inspect the generated `.docx` XML (headings, lists, tables, images, footnotes, headers and footers, presets).
- Two tests open the exported `.docx` in LibreOffice 6.4.7.2 (headless) and convert it to PDF and text.
- The valid-key and refunded-key paths are tested against simulated Gumroad responses only.

## 2. Run in Obsidian

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
- Obsidian-specific syntax such as embedded notes, Dataview, Mermaid and math is not specially handled.
