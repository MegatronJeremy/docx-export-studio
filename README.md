# DOCX Export Studio

Export an Obsidian note to a .docx file (the format Microsoft Word uses) with one command. No Pandoc, no command line, no account needed for the free version.

> **AI-assisted.** This plugin and this README were written with AI assistance (Claude) by Quillfern (AI-assisted), a small AI-assisted studio, and reviewed before release. The code is open source under the MIT licence.

> **Optional payment.** The export is free. An optional paid upgrade, **DOCX Export Studio Pro**, is a separate one-time purchase on Gumroad; [buy it on Gumroad](https://xparhyx.gumroad.com/l/bpfqja?utm_source=readme&utm_medium=top) or see "Buying and activating Pro" below. Pro adds style presets, real footnotes, header/footer and batch export; the free export above keeps working without it. The free version is not time-limited and never nags. Pro is sold by the same AI-assisted studio that wrote this plugin, so we earn money if you buy it.

## Free version

Run **Export current note to .docx** from the command palette, click the ribbon icon, or (from version 0.1.3) right-click a note (in the file explorer or in the editor) and choose **Export to .docx**. The `.docx` is saved next to the note, in your vault (an existing file is never overwritten; you get `Note (1).docx`, and so on).

Supported Markdown:

- Headings, paragraphs, bold, italic, strikethrough, highlight, inline code
- Links
- Bullet, numbered and task lists
- Tables
- Code blocks, block quotes, callouts
- Local images (`![[image.png]]` and `![](image.png)`) embedded from your vault

New in version 0.1.3 (not in the 0.1.2 release):

- Math (`$...$` and `$$...$$`) becomes native, editable Word equations for common LaTeX; LaTeX the converter does not understand stays as monospace source text. Currency such as `$5 and $6` stays text.
- Note embeds (`![[Other note]]`, `![[Note#Heading]]`, `![[Note#^block]]`) are inlined, up to 3 levels deep; cycles and missing notes become plain text.
- Optional table of contents (setting "Table of contents", or a `[[toc]]` line in a note). Word should ask to update fields when it opens the file (not tested in Word); LibreOffice does not fill it until updated.
- Page size (A4 default, or US Letter) and margins (normal or narrow) are free settings.
- Code blocks and inline code use editable Word styles ("Code Block" and "Inline Code"); tables keep column alignment and a header row and fit the page width.
- Setext headings (`Title` over `=====`), `[/]` and `[-]` task states, and HTML comments are handled; note properties (frontmatter) are never printed, and the title and author properties go into the file properties.

## FAQ

### How do I get an Obsidian note into Word without losing the formatting?
Run **Export current note to .docx** from the command palette (or click the ribbon icon). Headings, bold/italic/strikethrough/highlight, links, lists, task lists, tables, code blocks, quotes, callouts and local images become real Word elements, not pasted text. Final layout tweaks are still easiest in Word.

### Do I need Pandoc?
No. The plugin builds the .docx itself: no Pandoc, no command line, no PATH setup, and no extra download.

### Are images embedded in the .docx?
Yes for local images in your vault, both `![[image.png]]` and `![](image.png)`. Images are looked up through Obsidian's own link resolution rather than a file path passed to an external tool. Limit: we have not tested every vault layout (for example deeply nested attachment folders), so please open an issue if one fails. Web images are not embedded.

### Does it work on mobile?
No. It is desktop-only. It has also only been tested on Linux desktop so far (see Known limits).

### Can I use my own Word template or custom styles?
No. Using your own .docx as a template is not supported, in the free version or in Pro. The free version uses the plugin's default look; Pro adds style presets (fonts, spacing, margins, page size), not .docx templates.

### Where is the file saved, and can I choose the folder?
Next to the note, inside your vault. You can't pick another folder. An existing file is never overwritten: you get `Note (1).docx`, `Note (2).docx`, and so on.

### What about math and embedded notes?
In the 0.1.2 release, embedded notes and math are not specially handled. From version 0.1.3, math is converted to Word equations and note embeds are inlined (see "New in version 0.1.3" above). Dataview and Mermaid are not handled and may not convert.

### Does it send my notes anywhere?
No. Exporting works fully offline: no network call during export, no telemetry, analytics or ads, and your notes never leave your computer.

### Is the output tested in Microsoft Word?
Not yet. It was checked in LibreOffice (headless) and by inspecting the .docx XML. Word may show different spacing.

## Pro version (optional, paid)

Pro unlocks these features, built and covered by automated tests (see "Known limits" for what has not been tested):

- **Style presets**: four built-in presets (Default, Academic, Business, Compact) plus your own custom presets (font, body size, heading colour, line spacing, margins, Letter or A4).
- **Real footnotes (native .docx footnotes)**: `[^1]` references and definitions become real footnotes (from version 0.1.3 also inline `^[like this]` footnotes).
- **Header, footer and page numbers**: optional text and PAGE / NUMPAGES fields.
- **Batch export**: export all notes in a folder (optionally including subfolders) in one go, from the command palette or the folder's context menu. Capped at 200 notes per run.

Not included: using your own `.docx` file as a template. Pro offers style presets (built-in and user-defined), not custom .docx templates.

### Buying and activating Pro

1. Buy DOCX Export Studio Pro on Gumroad. Buy it here: https://xparhyx.gumroad.com/l/bpfqja?utm_source=readme&utm_medium=howto ($12, one-time).
2. Gumroad emails you a licence key.
3. In Obsidian: Settings → Community plugins → DOCX Export Studio → paste the key → **Verify**.

Keys from refunded or charged-back purchases, or from ended/cancelled subscriptions, fail verification. Refunds: reply to your Gumroad receipt within 30 days for a full refund; a refunded key fails verification. Pro stays active offline until you press **Re-check**; the plugin never re-checks by itself.

## Network use, privacy and data

- **One network call, only when you press Verify / Re-check**: the plugin sends your licence key and the Pro product id to `https://api.gumroad.com/v2/licenses/verify` (Gumroad's licence API). Nothing else is sent. It does not increase the licence's use count.
- The settings tab has one 'How to get Pro' link to the Pro page on Gumroad (the link carries utm tags that tell Gumroad the click came from the plugin). It opens in your browser only when clicked; the plugin loads nothing for it.
- **No network call at startup, in the background, or during export.** Exporting works fully offline.
- **No telemetry, analytics, ads or tracking.** No server of ours is involved.
- Your licence key and settings are stored locally in the plugin's `data.json` inside your vault. Your notes never leave your computer.
- The plugin reads the note being exported (and images it links to) and writes the `.docx` into your vault. It does not read or write anything else.

## Install

- **From the community directory:** Settings → Community plugins → Browse → search "DOCX Export Studio" → Install → Enable.
- **Manually**: download `main.js` and `manifest.json` from the latest GitHub release into `<your vault>/.obsidian/plugins/docx-export-studio/`, then enable the plugin under Community plugins.

## Known limits (honest status)

- **Tested in Obsidian 1.13.7 on Linux desktop on version 0.1.0** (`main.js` sha256 starts `bf84e5b9`). Versions 0.1.1 and 0.1.2 were not re-run in Obsidian. **Version 0.1.3 has not been run in Obsidian**: the right-click menu entries, the new settings and the Pro offline re-check are covered by automated tests and a type check only, not by a real Obsidian window. Automated tests (115) pass on the 0.1.3 source. See TESTED.md.
- **Pro features were exercised with the Pro state forced on in the test setup, not with a licence key.**
- **Not tested in Microsoft Word.** Output was checked in LibreOffice 6.4.7.2 (headless) and by inspecting the `.docx` XML. The converted PDFs were not viewed by eye.
- **Batch export with subfolders was not exercised.**
- **Not tested on Windows, macOS or mobile**; the plugin is desktop-only. Expect rough edges and please report them.
- **Minimum Obsidian version 1.5.0 is an estimate**, not verified against older versions.
- **Licence check against the live Gumroad service: only the rejection of an invalid key was confirmed.** The plugin showed "Gumroad does not recognise this licence key." and saved nothing.
- **Not yet confirmed: a real valid key, and a refunded key.** Accepting a valid key and rejecting a refunded one have been tested with simulated responses only.
- **The licence check has not yet been confirmed by a paid purchase, and the first buyers are that test.** If your key does not verify, reply to your Gumroad receipt and the purchase is refunded in full.
- Task-list checkboxes use the "Segoe UI Symbol" font; the look in Word is unverified.
- Microsoft Word may show different spacing than LibreOffice. Some Obsidian-specific syntax (Dataview, Mermaid) is not specially handled and may not convert.

## Known issues (found by the 0.1.3 syntax regression run)

- In the free version, footnotes (`[^1]`) are left as literal text; footnote conversion is a Pro feature.
- Callout fold markers (`-`/`+`) are ignored: callouts always export expanded.
- Custom task states (`[/]`, `[-]`) export as an unchecked box.
- Math that the converter does not understand stays as monospace source text.

## Support and licence

Report problems on the GitHub issues page of this repository. MIT licence (see `LICENSE`). Third-party licences: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Made by Quillfern (AI-assisted).

"Word" and "Obsidian" are trademarks of their respective owners. Not affiliated with Microsoft or Obsidian.
