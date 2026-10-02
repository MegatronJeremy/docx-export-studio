# Third-party notices

DOCX Export Studio's `main.js` bundles the `docx` library and its runtime dependencies. This list is every package in the production dependency tree of `package-lock.json` (generated 2026-10-02 from the lock file and each package's licence file or `package.json`). Development-only tools (TypeScript, esbuild, vitest and so on) are not shipped and are not listed.

DOCX Export Studio itself is MIT licensed (see `LICENSE`).

| Package | Version | Licence | Copyright |
|---|---|---|---|
| docx | 9.8.1 | MIT | Copyright (c) 2016 Dolan (as written in the package LICENSE file) |
| jszip | 3.10.2 | MIT (used under MIT; the package is dual-licensed MIT or GPL-3.0-or-later, and we choose MIT) | Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso |
| pako | 1.0.11 | MIT AND Zlib | Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn |
| xml | 1.0.1 | MIT | Copyright (c) 2011-2016 Dylan Greene |
| xml-js | 1.6.11 | MIT | Copyright (c) 2016-2017 Yousuf Almarzooqi |
| sax | 1.6.1 | BlueOak-1.0.0 (permissive) | Isaac Z. Schlueter (package author) |
| nanoid | 6.0.1 | MIT | Copyright 2017 Andrey Sitnik |
| hash.js | 1.1.7 | MIT | Copyright Fedor Indutny, 2014 |
| minimalistic-assert | 1.0.1 | ISC | Copyright 2015 Calvin Metcalf |
| inherits | 2.0.4 | ISC | Copyright (c) Isaac Z. Schlueter |
| immediate | 3.0.6 | MIT | Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, Domenic Denicola, Brian Cavalier |
| lie | 3.3.0 | MIT | Copyright (c) 2014-2018 Calvin Metcalf, Jordan Harband |
| setimmediate | 1.0.5 | MIT | Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, and Domenic Denicola |
| readable-stream | 2.3.8 | MIT | Copyright Node.js contributors |
| core-util-is | 1.0.3 | MIT | Copyright Node.js contributors |
| isarray | 1.0.0 | MIT | Julian Gruber (package author) |
| process-nextick-args | 2.0.1 | MIT | Copyright (c) 2015 Calvin Metcalf |
| safe-buffer | 5.1.2 | MIT | Copyright (c) Feross Aboukhadijeh |
| string_decoder | 1.1.1 | MIT | Copyright Node.js contributors |
| util-deprecate | 1.0.2 | MIT | Copyright (c) 2014 Nathan Rajlich |
| @types/node (nested under docx) | 26.6.4 | MIT | Copyright (c) Microsoft Corporation (type definitions only, not in the bundle) |
| undici-types (nested under docx) | 8.9.0 | MIT | Copyright (c) Matteo Collina and Undici contributors (type definitions only, not in the bundle) |

Licences other than MIT, ISC, BSD, Apache-2.0 or Zlib: `sax` is BlueOak-1.0.0, a permissive licence. `jszip` and `pako` offer or combine licences as stated in the table above. No copyleft licence is relied on.

The full licence texts are in each package's folder inside `node_modules` (`npm ci` installs them). The bundle keeps the licence headers esbuild leaves in place.
