# DOCX Export Studio

Export an Obsidian note to a .docx file (the format Microsoft Word uses) with one command. No Pandoc, no command line, no account needed for the free version.

> **AI-assisted.** This plugin and this README were written with AI assistance (Claude) by Quillfern (AI-assisted), a small AI-assisted studio, and reviewed before release. The code is open source under the MIT licence.

> **Optional payment.** The export is free. An optional paid upgrade, **DOCX Export Studio Pro**, is a separate one-time purchase on Gumroad; see "Buying and activating Pro" below for current availability. The free version is not time-limited and never nags.

## Free version

Run **Export current note to .docx** from the command palette, or click the ribbon icon. The `.docx` is saved next to the note, in your vault (an existing file is never overwritten; you get `Note (1).docx`, and so on).

Supported Markdown:

- Headings, paragraphs, bold, italic, strikethrough, highlight, inline code
- Links
- Bullet, numbered and task lists
- Tables
- Code blocks, block quotes, callouts
- Local images (`![[image.png]]` and `![](image.png)`) embedded from your vault

## Pro version (optional, paid)

Pro unlocks these features, built and covered by automated tests (see "Known limits" for what has not been tested):

- **Style presets**: four built-in presets (Default, Academic, Business, Compact) plus your own custom presets (font, body size, heading colour, line spacing, margins, Letter or A4).
- **Real footnotes (native .docx footnotes)**: `[^1]` references and definitions become real footnotes.
- **Header, footer and page numbers**: optional text and PAGE / NUMPAGES fields.
- **Batch export**: export all notes in a folder (optionally including subfolders) in one go, from the command palette or the folder's context menu. Capped at 200 notes per run.

Not included: using your own `.docx` file as a template. Pro offers style presets (built-in and user-defined), not custom .docx templates.

### Buying and activating Pro

1. Buy DOCX Export Studio Pro on Gumroad. Buy it here: https://xparhyx.gumroad.com/l/bpfqja ($12, one-time).
2. Gumroad emails you a licence key.
3. In Obsidian: Settings → Community plugins → DOCX Export Studio → paste the key → **Verify**.

Keys from refunded or charged-back purchases, or from ended/cancelled subscriptions, fail verification. Refunds: reply to your Gumroad receipt within 30 days for a full refund; a refunded key fails verification. Pro stays active offline until you press **Re-check**; the plugin never re-checks by itself.

## Network use, privacy and data

- **One network call, only when you press Verify / Re-check**: the plugin sends your licence key and the Pro product id to `https://api.gumroad.com/v2/licenses/verify` (Gumroad's licence API). Nothing else is sent. It does not increase the licence's use count.
- The settings tab has one 'How to get Pro' link to this README. It opens in your browser only when clicked; the plugin loads nothing for it.
- **No network call at startup, in the background, or during export.** Exporting works fully offline.
- **No telemetry, analytics, ads or tracking.** No server of ours is involved.
- Your licence key and settings are stored locally in the plugin's `data.json` inside your vault. Your notes never leave your computer.
- The plugin reads the note being exported (and images it links to) and writes the `.docx` into your vault. It does not read or write anything else.

## Install

- **From the community directory** (once accepted): Settings → Community plugins → Browse → search "DOCX Export Studio" → Install → Enable. *(Not listed yet: this line will be true only after the directory accepts it.)*
- **Manually**: download `main.js` and `manifest.json` from the latest GitHub release into `<your vault>/.obsidian/plugins/docx-export-studio/`, then enable the plugin under Community plugins.

## Known limits (honest status)

- **Tested in Obsidian 1.13.7 on Linux desktop**, with the exact release build (`main.js` sha256 starts `bf84e5b9`, `manifest.json` starts `b8005bbf`). 44 automated tests also check the generated `.docx` XML. See TESTED.md.
- **Pro features were exercised with the Pro state forced on in the test setup, not with a licence key.**
- **Not tested in Microsoft Word.** Output was checked in LibreOffice 6.4.7.2 (headless) and by inspecting the `.docx` XML. The converted PDFs were not viewed by eye.
- **Batch export with subfolders was not exercised.**
- **Not tested on Windows, macOS or mobile**; the plugin is desktop-only. Expect rough edges and please report them.
- **Minimum Obsidian version 1.5.0 is an estimate**, not verified against older versions.
- **Licence check against the live Gumroad service: only the rejection of an invalid key was confirmed.** The plugin showed "Gumroad does not recognise this licence key." and saved nothing.
- **Not yet confirmed: a real valid key, and a refunded key.** Accepting a valid key and rejecting a refunded one have been tested with simulated responses only.
- **The licence check has not yet been confirmed by a paid purchase, and the first buyers are that test.** If your key does not verify, reply to your Gumroad receipt and the purchase is refunded in full.
- Task-list checkboxes use the "Segoe UI Symbol" font; the look in Word is unverified.
- Microsoft Word may show different spacing than LibreOffice. Some Obsidian-specific syntax (embedded notes, Dataview, Mermaid, math) is not specially handled and may not convert.

## Support and licence

Report problems on the GitHub issues page of this repository. MIT licence (see `LICENSE`). Third-party licences: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Made by Quillfern (AI-assisted).

"Word" and "Obsidian" are trademarks of their respective owners. Not affiliated with Microsoft or Obsidian.
