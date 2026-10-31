# Method and limitations

Crop Advisor ranks 12 crops against the conditions a user enters. It is a transparent rule-based scorer, not a trained model. Every score can be traced to a range in `src/crops.js`.

> Data status: **sample, unvalidated.** Ranges are approximate values chosen for demonstration.

## Inputs and validation

| Input | Limit | Unit |
|---|---|---|
| pH | 3–10 | |
| Nitrogen (N) | 0–300 | kg/ha |
| Phosphorus (P) | 0–200 | kg/ha |
| Potassium (K) | 0–300 | kg/ha |
| Rainfall | 0–5000 | mm/yr |
| Temperature | −5–50 | °C |
| Humidity | 0–100 | % |
| Season | kharif, rabi, zaid | required |
| Soil | sandy, loamy, clay, silt, black, red | optional |

- Blank fields count as missing. Numeric strings (`"6.5"`) are accepted as numbers; other text is rejected.
- At least 3 numeric values are required, plus season.

## Factor scores

Each crop has `[idealLow, idealHigh, hardLow, hardHigh]` per numeric factor.

- Inside the ideal range: **1**.
- Between ideal and hard edge: linear decay, reaching **0** at the hard edge.
- Beyond the hard edge: **0**.
- Season: **1** if the crop is grown in that season, else **0**.
- Soil: **1** if listed for the crop, else **0.3**.

## Overall score

Weighted average of the factors the user supplied, times 100 (one decimal).

| Factor | Weight |
|---|---|
| pH, rainfall, temperature, season, soil | 1.5 each |
| N, P, K | 1 each |
| Humidity | 0.75 |

Unsupplied factors are left out of the average, not assumed. Total weight if everything is supplied: 11.25.

## Category

| Score | Category |
|---|---|
| ≥ 80 | High |
| ≥ 60 | Moderate |
| ≥ 40 | Low |
| < 40 | Poor |

**Cap:** if any supplied factor is outside the crop's hard range (strictly beyond the hard edge), or the season does not match, the category is capped at **Low** however high the score. This stops one fatal mismatch being averaged away.

## Confidence

Confidence is the share of total weight the user supplied, so season counts but soil and missing numbers do not.

| Share | Confidence |
|---|---|
| ≥ 80% | Good |
| ≥ 55% | Moderate |
| otherwise | Low |

Missing inputs are listed by name. They are never guessed or filled with defaults.

## Explanations

Each factor gets a note built from the crop's own range, for example: "Rainfall 400 mm is below ideal 1000–2000 mm". Notes appear under **Why this score?** and in the comparison table.

## Comparison

Two or three crops are scored on the same inputs. The table shows each factor per crop, highlights the best crop for each factor (blank when tied), and names the best overall crop, or reports a tie.

## Limitations

- **Unvalidated data.** Ranges are not from a vetted agronomic source. Do not use for real planting decisions.
- **Annual rainfall only.** Seasonal and monthly distribution is not modelled.
- **No yield, price or economics.** Suitability only.
- **No interactions.** Factors are scored independently; for example, pH does not change nutrient availability in the model.
- **Ties on sparse input.** With few inputs many crops can score 100. The app warns about ties and low confidence.
- **Ranking uses the score, not the capped category.** A crop capped at Low (for example, wrong season) can still rank above an uncapped crop with a lower score. Its Low badge and notes explain why.
- **Season and soil are categorical.** Real suitability is graded; season is binary here, soil is two-level.
- **Single point in time.** One set of readings, not a time series.
- **Stateless.** Nothing is stored; each request stands alone.
