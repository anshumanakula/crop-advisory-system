# Test report: Crop Advisor (HACK-P302)

Generated: 2026-10-31T10:10:18.413Z
Node: v22.23.4

## Summary

- Tests: 42
- Passed: 42
- Failed: 0
- Result: PASS

## Example profiles

| Profile | Expected #1 | Actual #1 (score) | #2 (score) | Confidence | Verdict |
|---|---|---|---|---|---|
| Monsoon paddy | rice | Rice (100) | Sugarcane (94.9) | Good 100% | PASS |
| Winter wheat | wheat | Wheat (100) | Tomato (92.9) | Good 100% | PASS |
| Dry sandy | pearl-millet | Pearl millet (100) | Groundnut (81.8) | Good 100% | PASS |
| Potato | potato | Potato (100) | Tomato (97.3) | Good 100% | PASS |
| Black-soil cotton | cotton | Cotton (100) | Sugarcane (88.3) | Good 100% | PASS |
| Sparse input (edge case) | — | Cotton (100) | Groundnut (100) | Low 53% | PASS (low-confidence warning shown) |

## Test cases

- [x] api: GET /api/meta lists fields, seasons, soils and 12 crops
- [x] api: POST /api/recommend returns ranked results with confidence
- [x] api: recommend accepts numeric strings and blank fields
- [x] api: recommend returns 400 with field errors for invalid input
- [x] api: POST /api/compare returns rows and best crop
- [x] api: compare returns 400 for a single crop or unknown crop
- [x] api: malformed JSON returns 400 without a stack trace
- [x] api: body over 10kb is rejected with 413
- [x] api: non-object JSON body returns 400
- [x] api: security headers on pages and API responses
- [x] api: rate limit returns 429 after the per-minute quota
- [x] api: default rate limit is 60 requests per minute per IP
- [x] api: unknown API route returns JSON 404
- [x] static: index page has no inline scripts and loads app.js
- [x] validate: blank fields are missing and numeric strings are numbers
- [x] validate: enforces limits at and beyond each boundary
- [x] validate: season is required and must be known
- [x] validate: at least 3 numeric values are needed
- [x] validate: rejects non-numeric text, bad soil and non-object input
- [x] rangeScore: 1 inside ideal range including edges
- [x] rangeScore: decays linearly to 0 at the hard edge
- [x] rangeScore: 0 beyond the hard range
- [x] weights: pH/rainfall/temperature/season/soil 1.5, NPK 1, humidity 0.75
- [x] categoryFor: thresholds 80 / 60 / 40
- [x] scoring: weighted average of supplied factors only
- [x] scoring: soil mismatch scores 0.3 and match scores 1
- [x] scoring: season is 1 or 0, and a season mismatch caps category at Low
- [x] scoring: a factor outside its hard range caps category at Low
- [x] notes: plain-language wording
- [x] confidence: full input is Good with nothing missing
- [x] confidence: sparse input is Low and lists missing inputs
- [x] confidence: thresholds Good >= 80%, Moderate >= 55%
- [x] ranking: results sorted by score descending with ranks
- [x] profile: Monsoon paddy ranks rice first
- [x] profile: Winter wheat ranks wheat first
- [x] profile: Dry sandy ranks pearl-millet first
- [x] profile: Potato ranks potato first
- [x] profile: Black-soil cotton ranks cotton first
- [x] profile: sparse input gives a low-confidence warning and no expected crop
- [x] compare: returns per-factor rows and the best crop
- [x] compare: accepts three crops, rejects fewer, more, duplicates and unknown ids
- [x] crop table: 12 crops with ordered ranges, known seasons and soils

## Notes

- Crop ranges are a sample table, unvalidated. Passing tests show the engine behaves as specified, not that the agronomy is correct.
- Browser behaviour (compare table after "Get recommendation") is checked separately by a headless Chrome run, described in README.md.
