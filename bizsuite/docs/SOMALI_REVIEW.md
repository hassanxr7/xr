# Somali language: status and review guide

**Status: complete in coverage, not yet reviewed by a native speaker.** I (the developer) wrote the Somali text. It must be read by a Somali speaker who knows retail, barber and accounting vocabulary before staff rely on it. Nothing here claims linguistic certification.

## Coverage (checked by `npm run i18n` and a unit test)
| Area | Strings | Somali |
|---|---|---|
| Screens: menus, buttons, tabs, forms, table headers, help texts, toasts | 380 | 380 (100 %) |
| Server error messages (140 error codes) | 140 | 140 (100 %) |
| Printed documents: receipts, A4 invoices, quotations, repair slips | all labels | translated (`?lang=so`, follows the user's language) |
| Reports (titles, column headings, profit statement lines) – screen, CSV, Excel, PDF, print | all | translated |
| Notifications (low stock, cash difference, approvals, repairs, overdue invoices…) | 11 patterns | translated; free-text parts (product names, approval summaries typed by the system) stay as written |
| Data you type (names, notes, product names) | – | never translated (it is your data) |
A browser sweep in Somali mode (`npm run e2e:sweep`) opens every page, dialog and form for every role and fails if any known English UI string is still visible.

## How to review (≈ 2–3 hours for a bilingual accountant/shop manager)
1. Open `docs/somali-review.csv` in Excel/Sheets – 559 rows: *Type, English, Somali (current), Reviewer correction, Approved?*. Fill the *Reviewer correction* column only where the Somali is wrong or unnatural.
2. Sign in, switch to **Soomaali** (top bar) and walk through the guides in `USER_GUIDE.md` – the in-context view often shows wording problems the list does not.
3. Send the corrected CSV back (or edit `public/i18n*.js` yourself: `i18n.js` base, `i18n_more.js`, `i18n_err.js`, `i18n_docs.js`). Run `npm run i18n` – it must say *missing: 0* – and `npm test`.

## Glossary used (please confirm or correct these first – they appear everywhere)
| English | Somali used | Note |
|---|---|---|
| Branch / Business / Organisation | Laan / Ganacsi / Ururka | |
| Barber | **Berber** | the common street usage; alternative *timo-jare* |
| Commission | **Komishan** | loan word; alternative *boqolleyda shaqaalaha* |
| Invoice / Receipt | **Faktuur** / **Rasiid** | |
| Discount | Qiimo dhimis | |
| Deduction | **Jarid** | authorised deduction from pay |
| Advance (to staff) | Hormaris | |
| Take-home | Qaadashada gurigga | commission − advances − deductions |
| Retained (by business) | (Ganacsiga) ku hadhay | |
| Revenue / income | Dakhli | |
| Profit (gross / net) | Faa'iido (guud / saafi ah) | |
| Stock / Inventory | Kayd / Bakhaar | |
| Cash register (till) | Sanduuqa lacagta | *Sanduuqle* = cashier |
| Reconcile | Isu dheelli tir | bank / mobile-money reconciliation |
| Return / Refund | Soo celin | |
| Serial / IMEI | Taxane / IMEI | |
| Warranty | Damaanad | |
| Quotation | Qiimeyn | |
| Approval | Ogolaansho | |
| Mobile money | Lacagta mobaylka | |
| Overdue | Dib u dhacay | |
