# Third-party dependencies and licensing

## Runtime
| Component | Use | Licence |
|---|---|---|
| **Node.js 22 LTS** (includes OpenSSL, SQLite, V8) | runtime, crypto, `node:sqlite`, `node:http` | MIT (Node.js) + bundled components under their own permissive licences (SQLite: public domain; OpenSSL: Apache-2.0; V8: BSD-3-Clause) |
| **npm packages** | **none at runtime** – `package.json` has no dependencies | – |
| **jsQR 1.4.0** (`public/vendor/jsQR.js`, unmodified, licence in `public/vendor/jsQR.LICENSE.txt`) | decodes QR codes from the camera in browsers without the built-in BarcodeDetector (loaded only when the camera is used) | Apache-2.0 |
| QR code generator | `src/qr.js`, written for this project (ISO/IEC 18004 byte mode, level M) | project code |
| Fonts / icons / CDNs | **none**: system fonts, Unicode symbols, inline SVG; the app makes no third-party requests | – |

## Deployment
| Component | Use | Licence |
|---|---|---|
| Docker Engine / Compose | containers | Apache-2.0 (Docker Desktop, if anyone uses it on a workstation, has separate commercial terms – not needed on servers) |
| Caddy 2 | reverse proxy + automatic HTTPS | Apache-2.0 |
| Let's Encrypt | TLS certificates | free service (ISRG terms) |
| Debian (base of `node:22-slim`) | container OS | mixed open-source (mostly GPL/LGPL/BSD) |

## Test-only (not shipped)
| Playwright 1.56 | browser automation | Apache-2.0 |
| Chromium | test browser | BSD-3-Clause and others |

## This project
The source code was written for this project and has **no third-party code copied in**. `package.json` marks it `UNLICENSED` (all rights reserved) so ownership can be assigned to you in your contract. **No paid modules, no per-user or per-branch licence fees.** (Existing platforms such as ERPNext, Odoo or UltimatePOS were *not* used – see `PROPOSAL.md` for the reasoning; if you reconsider them, verify their current editions and licence terms, which change.)
