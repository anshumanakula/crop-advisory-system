# Crop Advisor

Crop recommendation web app for **Hackathon problem #3 (HACK-P302)**. Enter season, soil and field conditions (pH, N, P, K, rainfall, temperature, humidity); get ranked crops with a score, category, plain-language reasons, a confidence level and a side-by-side comparison.

> **Advisory only.** Crop ranges are a *sample, unvalidated* table. Not agronomic advice.

## Setup

Requires Node 18.15+.

```bash
npm install
npm start          # http://localhost:3000  (set PORT to change)
npm test           # 42 tests, node:test
npm run report     # regenerates TEST_REPORT.md
```

Only dependency: `express`. No database, no API keys, stateless.

Behind a reverse proxy (Render, Railway, etc.) set `TRUST_PROXY=1` so the rate limiter sees real client IPs.

## Architecture

```
server.js          Express app: security headers, 10kb JSON limit, 60 req/min/IP on /api, generic error handler
src/crops.js       12-crop sample table: [idealLow, idealHigh, hardLow, hardHigh] per factor, seasons, soils
src/engine.js      validate, rangeScore, scoring, category, confidence, notes, compare
public/            index.html, style.css, app.js (vanilla JS, no inline scripts), profiles.json
test/              engine.test.js, api.test.js
scripts/report.js  runs tests, writes TEST_REPORT.md
scripts/ui-smoke.js  optional headless Chrome check (see below)
```

### API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/meta` | none | fields, limits, seasons, soils, crops, disclaimer |
| POST | `/api/recommend` | `{season, soil?, ph?, n?, p?, k?, rainfall?, temperature?, humidity?}` | ranked results, confidence, warnings |
| POST | `/api/compare` | same fields plus `crops: [id, id(, id)]` | per-factor rows, best crop |

Errors return `{error, fields}` with status 400 (invalid input, malformed JSON), 413 (body > 10kb), 429 (rate limit), 500 (generic, no stack trace).

```bash
curl -s localhost:3000/api/recommend -H 'content-type: application/json' \
  -d '{"season":"kharif","soil":"clay","ph":6.2,"rainfall":1500,"temperature":28}'
```

See [METHOD.md](METHOD.md) for scoring rules and limitations.

## Demo script (about 3 minutes)

1. **Banner (10 s).** Point at the advisory banner: sample data, advisory only.
2. **Monsoon paddy (40 s).** Pick *Monsoon paddy*, press **Get recommendation**. Rice ranks #1, High, confidence Good. Open **Why this score?** to show plain-language notes.
3. **Compare (40 s).** Top 2 crops are pre-selected: the compare table shows Rice vs Sugarcane per factor. Tick a third crop (Cotton); the table gains a column. Untick down to one to show the "select 2 or 3" message.
4. **Season cap (30 s).** Pick *Winter wheat*, change season to *Kharif*, recommend again. Wheat still scores 86.7 but its badge drops to Low and it falls to #4 behind Maize and Cotton: a season mismatch caps the category. Open **Why this score?** on Wheat to show the season note.
5. **Sparse input (30 s).** Pick *Sparse input*. Low-confidence banner, missing inputs listed (not guessed), tie warning at the top.
6. **Validation (15 s).** Reset, press the button with nothing entered. Inline error on Season.
7. **Export (20 s).** **Download JSON**, then **Print / PDF** (form is hidden in print layout).
8. **Tests (15 s).** `npm test` in the terminal: 42 passing.

## UI smoke test (optional)

`scripts/ui-smoke.js` drives real Chrome through every example profile and checks that the compare table renders after **Get recommendation**. Not part of `npm test` and not a dependency.

```bash
npm i --no-save puppeteer-core
npm start &                       # in another terminal if you prefer
CHROME_PATH=/usr/bin/google-chrome node scripts/ui-smoke.js http://localhost:3000 shots/run
```

## Known limits

- Annual rainfall only; no seasonal or monthly rainfall.
- No yield prediction.
- Sparse input can produce ties (many crops score 100 on three inputs); the app warns instead of guessing.
- Crop ranges are approximate and unvalidated.
- Rate limit is in memory, per process, applied to `/api` only.
