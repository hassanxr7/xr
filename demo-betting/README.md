# Demo Betting

A complete practice sportsbook and casino in the style of the big betting sites — with
simulated matches and virtual **demo coins (DC)**. No real money is involved anywhere:
there are no payment forms, and coins can't be withdrawn.

> **Soomaali:** Demo Betting waa goob tababar oo sharad isboorti iyo kasiino ah. Ciyaaraha
> waa la dayday, lacagtuna waa tijaabo (DC). Lacag dhab ah lama dhigo, lamana bixiyo.
> Luqadda caadiga ah waa Soomaali; English waa la dooran karaa.

## Run it

No build step and no server needed — it's plain HTML, CSS and JavaScript.

- Open `index.html` in a browser, or
- serve the folder: `npx serve demo-betting` (or any static host such as GitHub Pages).

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
- Demo top-ups, transaction history, stats, account reset.
- Somali/English, dark/light theme, decimal/fractional/American odds.
- Responsive: three-column desktop layout, drawers and a bottom tab bar on phones.

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
js/i18n.js        Somali + English text, market labels, odds formats
js/store.js       accounts, wallet, bets, settlement, cash out
js/sports.js      home, live, upcoming, league, event, results, search views
js/betslip.js     bet slip
js/account.js     auth, top-up, my bets, account, promotions, about
js/casino.js      casino lobby, Crash, Mines, Dice, Slots
js/app.js         router, layout, event handling, 1-second live tick
tests/engine.test.js  odds calibration, settlement and RTP checks (node demo-betting/tests/engine.test.js)
```

## Data & privacy

Accounts, bets and settings are saved in the browser's `localStorage` only. Passwords are
hashed locally, but this is a demo — don't reuse a real password. Clearing site data resets
everything.

18+ · Play responsibly.
