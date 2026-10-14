# Demo Betting

A complete practice sportsbook and casino in the style of the big betting sites — with
simulated matches and virtual **demo coins (DC)**. No real money is involved anywhere:
there are no payment forms, and coins can't be withdrawn.

> **Soomaali:** Demo Betting waa goob tababar oo sharad isboorti iyo kasiino ah. Ciyaaraha
> waa la dayday, lacagtuna waa tijaabo (DC). Lacag dhab ah lama dhigo, lamana bixiyo.
> Luqadda caadiga ah waa English; Soomaali waa la dooran karaa.

## Run it

No build step and no server needed — it's plain HTML, CSS and JavaScript.

- Open `index.html` in a browser,
- serve the folder: `npx serve demo-betting` (or any static host such as GitHub Pages), or
- run the bundled server, which also enables SovaMoney sandbox deposits: `cd demo-betting && npm start`.

Tests: `cd demo-betting && npm test`.

## What's inside

**Sportsbook**
- 8 sports: football, basketball, tennis, ice hockey, volleyball, table tennis, esports, handball —
  ~20 leagues including the Somali Premier League.
- Live and upcoming boards grouped by league, with 1 X 2, double chance, handicap and totals columns.
- Event pages with 15+ markets: match result, double chance, totals, handicaps, team totals,
  both teams to score, next goal, odd/even, correct score, set/map winner, set handicap.
- Live scoreboards: clock, period scores, goal list, set-by-set points.
- Results page, league pages and search.

**Bet slip**
- Singles and accumulators, quick stakes, potential win.
- Odds-change policy: accept any / accept higher / ask first.
- Accumulator boost (+10% for 5+ selections at 1.30+).
- Cash out on open bets, valued from live win probabilities.
- Automatic settlement when matches finish, with notifications.

**Casino**
- Crash (RTP 97%, auto cash out), Mines (3% edge), Dice (1% edge), Fruit Slots (RTP 94.6%).
- Daily lucky wheel on the Promotions page.

**Account**
- One-click or username registration with a 1,000 DC welcome bonus.
- Demo top-ups, SovaMoney sandbox deposits (with the bundled server), transaction history, stats, account reset.
- English (default) and Somali, dark/light theme, decimal/fractional/American odds.
- Responsive: three-column desktop layout, drawers and a bottom tab bar on phones.

## SovaMoney sandbox deposits

The Deposit window has a **SovaMoney** tab that runs a real hosted-checkout payment against
SovaMoney's **sandbox**. Once SovaMoney confirms the payment, the amount is added to the player's
balance as demo coins (1 USD = 1 DC). No real money moves.

It needs the small Node server in `server/` (no dependencies, Node 20+), because the merchant
keys must stay on a server. Opened as a plain file or static page, the tab explains that it is
unavailable.

```
cd demo-betting
PUBLIC_URL=https://your-domain.example \
SOVAMONEY_PUBLIC_KEY=... SOVAMONEY_SECRET_KEY=... \
npm start
```

All settings are listed in `server/.env.example`. Set the keys in your host's environment or
secret store. Never commit them, and never put them in the browser code.

`PUBLIC_URL` must be a public HTTPS address so SovaMoney can reach the notification URL.
For a quick test from your own computer, a tunnel such as ngrok or Cloudflare Tunnel works.

**Flow**

1. The player picks an amount (1–1,000 USD). The server records a pending deposit and sends the
   documented fields to `https://sovamoney.com/sandbox/payment/initiate`.
2. The server checks that the returned checkout URL is on `sovamoney.com` over HTTPS, then the
   player is sent there to pay.
3. SovaMoney posts the IPN to `/payments/sovamoney/ipn`. The server checks it before confirming:
   - the signature, `UPPERCASE(HMAC_SHA256(data.amount + identifier, secret))`, compared in
     constant time
   - that the reference is one of its own pending deposits
   - the amount and currency
   Then it confirms the deposit once and writes a ledger entry. Repeated notifications are no-ops.
4. The return pages (`/payments/success`, `/payments/cancel`) only show the stored status. A
   success visit never credits, and a cancel never overrides a confirmed payment.
5. The deposit page polls the server and moves a confirmed deposit into the wallet exactly once.

Deposit records live in `server/data/deposits.json`, which is written atomically and ignored by
git. They are tied to the player's browser account by a random token.

**Check with your first sandbox payment.** The guide these steps come from is not an official
SovaMoney document. Its own section 11 lists what to confirm against a real sandbox capture:

| Item | What the server does now | If the capture differs |
| --- | --- | --- |
| Request encoding | `multipart/form-data`, as in the guide's PHP example | `SOVAMONEY_ENCODING=form` or `json` |
| IPN body | accepts multipart, urlencoded or JSON with `data[amount]` | adjust `handleIpn` in `server/server.js` |
| Amount format | signature uses the amount string exactly as received (e.g. `10.00000000`) | — |
| Currency field | `data.currency.code` or `data.currency`, if present | — |
| Acknowledgement | replies `200 OK` | change the reply in `handleIpn` |
| Checkout host | `sovamoney.com`, `www.sovamoney.com` | `CHECKOUT_HOSTS` in `server/sovamoney.js` |

**Live payments are switched off on purpose.** `SOVAMONEY_MODE=live` refuses to start. Wallets,
bets and game results still live in each player's browser, where players can edit them. Real
money first needs server-side accounts, wallet, bet settlement and game randomness, plus a
gambling licence and SovaMoney's approval for a betting merchant.

## How the simulation works

Each match is generated with its whole outcome in advance (a goal timeline, or the winner and
points of every set) and plays out on a fast clock — about 8 minutes for football. The live
state is derived from the clock, so reloading the page doesn't change anything.

Odds come from the same model that drew the result, so the book is fair before the margin:

- **Goal sports:** final score = current score + Poisson(expected goals × time remaining).
- **Set sports:** each set is won with a fixed probability; the set in play is a race to the
  target from the current points.

A margin weighted by p(1−p) is applied on top (about 5–6% house edge on standard markets,
~12% on correct score). New matches are scheduled continuously so the board always has live
and upcoming events.

## Files

```
index.html        page shell
css/style.css     all styles (dark-first, light theme via prefers-color-scheme or data-theme)
js/util.js        DOM, random numbers, storage, formatting, toasts, modal, icons
js/data.js        sports, leagues, teams
js/engine.js      match generator, live state, markets/odds, settlement
js/i18n.js        English + Somali text, market labels, odds formats
js/store.js       accounts, wallet, bets, settlement, cash out
js/sports.js      home, live, upcoming, league, event, results, search views
js/betslip.js     bet slip
js/account.js     auth, top-up, my bets, account, promotions, about
js/casino.js      casino lobby, Crash, Mines, Dice, Slots
js/app.js         router, layout, event handling, 1-second live tick
js/payments.js    SovaMoney deposit tab and deposit status page (browser side)
server/server.js  static site + deposit API + IPN handler
server/sovamoney.js  initiate request, checkout-host check, IPN signature
server/store.js   deposit records and ledger (atomic JSON file)
img/logo.png      logo sent to SovaMoney as site_logo
tests/engine.test.js    odds calibration, settlement and RTP checks
tests/payments.test.js  SovaMoney flow: signatures, idempotency, ownership, failures
```

## Data & privacy

Accounts, bets and settings are saved in the browser's `localStorage` only. Passwords are
hashed locally, but this is a demo — don't reuse a real password. Clearing site data resets
everything.

18+ · Play responsibly.
