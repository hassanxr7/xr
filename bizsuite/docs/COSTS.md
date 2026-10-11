# Costs: licences, integrations, recurring expenses, SaaS activation

> **Read this first.** Hours are planning estimates for a competent developer working on this code base. Money figures use an **assumed blended rate of USD 40/hour** purely so the numbers are comparable – substitute your actual rate. Third-party prices (hosting, SMS, WhatsApp, card/mobile-money fees) **change and vary by country; they are indicative ranges to be verified with each provider before you commit.** None of this is a binding quotation.

## 1. Software licences
**USD 0.** No paid modules, no per-user/branch fees, no third-party licensed code (see `THIRD_PARTY.md`).

## 2. Recurring running costs (single-owner mode)
| Item | Indicative cost |
|---|---|
| VPS / cloud VM (1–2 vCPU, 2 GB RAM, 20–40 GB SSD) | USD 6–15 / month |
| Domain name | USD 10–20 / year |
| TLS certificate | free (Let's Encrypt via Caddy) |
| Off-site backup storage (a few GB) | USD 0–5 / month |
| Uptime monitoring | free tier available |
| **Total** | **≈ USD 10–25 / month** |
Plus support/maintenance if contracted (see `PROPOSAL.md` §12).

## 3. Optional integrations (NOT built – each needs a provider account)
| Integration | One-time build | Recurring provider cost (indicative; verify) | Notes |
|---|---|---|---|
| E-mail notifications (SMTP / transactional API) | 12–20 h (≈ USD 480–800) | free tiers up to a few hundred mails/day, then ≈ USD 15–25 / month | delivery status stored in `channel_deliveries` |
| SMS | 20–30 h (≈ USD 800–1,200) | per message, depends on country & operator – often a few US cents; sender-ID registration may be needed | cost per message stored for reporting |
| WhatsApp Business API | 30–50 h (≈ USD 1,200–2,000) | Meta conversation pricing + BSP fee; message templates require approval | opt-in rules apply |
| Mobile-money API (per operator) | 40–80 h each (≈ USD 1,600–3,200) | operator's merchant fee per transaction; merchant agreement and sandbox certification (can take weeks) | confirmation by webhook only – the code already refuses to mark provider payments *confirmed* without it |
| Card gateway (e.g. Stripe-type) | 30–50 h (≈ USD 1,200–2,000) | typically a percentage + fixed fee per card payment | needs a registered business and compliant checkout (hosted fields) |
Manual mobile-money recording (what exists today) is clearly labelled *manual* in the UI and in reports.

## 4. Activating SaaS subscriptions for independent owners (NOT built)
Already in place: tenant isolation, plan limits (branches/users/storage/modules), suspension, platform console, controlled & logged support access.
Remaining work:
| Work item | Hours |
|---|---|
| Subscription billing: plans, checkout, webhooks, invoices/receipts, tax, dunning, upgrades/downgrades | 80–120 |
| Tenant self-sign-up, e-mail verification, onboarding wizard (first business/branch/roles) | 40–60 |
| PostgreSQL migration with row-level security + tenant-scoped backup/restore/export | 100–140 |
| Usage metering, limit-enforcement UX, plan management screens | 40–60 |
| Platform console additions (tenant search, billing state, support-session audit viewer, announcements) | 40–60 |
| Data export / deletion workflows, terms of service, privacy policy, DPA (+ legal review fees) | 30–50 |
| Monitoring, alerting, status page, support tooling | 30 |
| Independent penetration test (external) | typically USD 3,000–10,000 |
| **Total build** | **≈ 360–520 h ≈ USD 14,400–20,800** + external pen-test |
Recurring SaaS costs: managed PostgreSQL (≈ USD 20–100+/month and up with load), larger/redundant app hosting, e-mail/SMS, payment-processor fees (percentage of subscription revenue), support staff time, accounting/tax compliance in each customer's jurisdiction.
**Recommendation:** run your own businesses on this system first; start the SaaS work only when you have 3–5 interested outside owners to validate pricing and compliance needs.
