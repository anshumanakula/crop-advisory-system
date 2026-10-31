'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/engine');
const { CROPS, SEASONS, SOILS } = require('../src/crops');
const { profiles } = require('../public/profiles.json');

const FULL = { season: 'kharif', soil: 'clay', ph: 6.2, n: 90, p: 45, k: 45, rainfall: 1500, temperature: 28, humidity: 80 };

test('validate: blank fields are missing and numeric strings are numbers', () => {
  const r = engine.validate({ season: 'Kharif', soil: '', ph: ' 6.5 ', n: '', rainfall: '800', temperature: 27, humidity: null });
  assert.equal(r.ok, true);
  assert.equal(r.values.season, 'kharif');
  assert.equal(r.values.ph, 6.5);
  assert.equal(r.values.rainfall, 800);
  assert.equal(r.values.n, undefined);
  assert.equal(r.values.soil, undefined);
  assert.equal(r.values.humidity, undefined);
});

test('validate: enforces limits at and beyond each boundary', () => {
  const limits = { ph: [3, 10], n: [0, 300], p: [0, 200], k: [0, 300], rainfall: [0, 5000], temperature: [-5, 50], humidity: [0, 100] };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const base = { season: 'rabi', ph: 6, rainfall: 500, temperature: 20 };
    for (const ok of [min, max]) {
      const r = engine.validate({ ...base, [key]: ok });
      assert.equal(r.ok, true, `${key}=${ok} should be valid`);
    }
    for (const bad of [min - 0.1, max + 0.1]) {
      const r = engine.validate({ ...base, [key]: bad });
      assert.equal(r.ok, false, `${key}=${bad} should be invalid`);
      assert.ok(r.errors[key], `${key} error present`);
    }
  }
});

test('validate: season is required and must be known', () => {
  const noSeason = engine.validate({ ph: 6, rainfall: 500, temperature: 20 });
  assert.ok(noSeason.errors.season);
  const badSeason = engine.validate({ season: 'monsoon', ph: 6, rainfall: 500, temperature: 20 });
  assert.ok(badSeason.errors.season);
});

test('validate: at least 3 numeric values are needed', () => {
  const r = engine.validate({ season: 'kharif', ph: 6, rainfall: 500 });
  assert.equal(r.ok, false);
  assert.match(r.errors._form, /at least 3/i);
  assert.equal(engine.validate({ season: 'kharif', ph: 6, rainfall: 500, temperature: 20 }).ok, true);
});

test('validate: rejects non-numeric text, bad soil and non-object input', () => {
  const r = engine.validate({ season: 'kharif', soil: 'rocky', ph: 'abc', rainfall: '0x10', temperature: 20 });
  assert.ok(r.errors.ph);
  assert.ok(r.errors.rainfall);
  assert.ok(r.errors.soil);
  assert.ok(engine.validate(null).errors._form);
  assert.ok(engine.validate([1, 2]).errors._form);
});

test('rangeScore: 1 inside ideal range including edges', () => {
  const range = [10, 20, 0, 40];
  for (const v of [10, 15, 20]) assert.equal(engine.rangeScore(v, range), 1);
});

test('rangeScore: decays linearly to 0 at the hard edge', () => {
  const range = [10, 20, 0, 40];
  assert.equal(engine.rangeScore(5, range), 0.5);
  assert.equal(engine.rangeScore(30, range), 0.5);
  assert.equal(engine.rangeScore(0, range), 0);
  assert.equal(engine.rangeScore(40, range), 0);
});

test('rangeScore: 0 beyond the hard range', () => {
  const range = [10, 20, 0, 40];
  assert.equal(engine.rangeScore(-1, range), 0);
  assert.equal(engine.rangeScore(41, range), 0);
});

test('weights: pH/rainfall/temperature/season/soil 1.5, NPK 1, humidity 0.75', () => {
  const w = Object.fromEntries(engine.FIELDS.map((f) => [f.key, f.weight]));
  assert.deepEqual(w, { ph: 1.5, n: 1, p: 1, k: 1, rainfall: 1.5, temperature: 1.5, humidity: 0.75 });
  assert.equal(engine.SEASON_WEIGHT, 1.5);
  assert.equal(engine.SOIL_WEIGHT, 1.5);
  assert.equal(engine.TOTAL_WEIGHT, 11.25);
});

test('categoryFor: thresholds 80 / 60 / 40', () => {
  assert.equal(engine.categoryFor(100), 'High');
  assert.equal(engine.categoryFor(80), 'High');
  assert.equal(engine.categoryFor(79.9), 'Moderate');
  assert.equal(engine.categoryFor(60), 'Moderate');
  assert.equal(engine.categoryFor(59.9), 'Low');
  assert.equal(engine.categoryFor(40), 'Low');
  assert.equal(engine.categoryFor(39.9), 'Poor');
});

test('scoring: weighted average of supplied factors only', () => {
  // Rice, supplied: season (match, 1.5) + ph (ideal, 1.5) + temperature (ideal, 1.5) => 100
  const r = engine.recommend({ season: 'kharif', ph: 6, temperature: 28, rainfall: 1500 });
  const rice = r.results.find((c) => c.id === 'rice');
  assert.equal(rice.score, 100);
  assert.equal(rice.factors.some((f) => f.key === 'soil'), false);
  assert.equal(rice.factors.some((f) => f.key === 'n'), false);
});

test('scoring: soil mismatch scores 0.3 and match scores 1', () => {
  const rice = CROPS.find((c) => c.id === 'rice');
  const mismatch = engine.scoreCrop(rice, { season: 'kharif', soil: 'sandy', ph: 6, rainfall: 1500, temperature: 28 });
  const match = engine.scoreCrop(rice, { season: 'kharif', soil: 'clay', ph: 6, rainfall: 1500, temperature: 28 });
  assert.equal(mismatch.factors.find((f) => f.key === 'soil').score, 0.3);
  assert.equal(match.factors.find((f) => f.key === 'soil').score, 1);
  assert.ok(mismatch.score < match.score);
});

test('scoring: season is 1 or 0, and a season mismatch caps category at Low', () => {
  const wheat = CROPS.find((c) => c.id === 'wheat');
  const input = { season: 'kharif', soil: 'loamy', ph: 6.8, n: 100, p: 50, k: 40, rainfall: 600, temperature: 18, humidity: 60 };
  const r = engine.scoreCrop(wheat, input);
  assert.equal(r.factors.find((f) => f.key === 'season').score, 0);
  assert.ok(r.score >= 80, `uncapped score should be high, got ${r.score}`);
  assert.equal(r.capped, true);
  assert.equal(r.category, 'Low');
});

test('scoring: a factor outside its hard range caps category at Low', () => {
  const rice = CROPS.find((c) => c.id === 'rice');
  const r = engine.scoreCrop(rice, { season: 'kharif', soil: 'clay', ph: 6, n: 90, p: 45, k: 45, rainfall: 100, temperature: 28, humidity: 80 });
  assert.ok(r.score >= 80);
  assert.equal(r.capped, true);
  assert.equal(r.category, 'Low');
  assert.equal(r.factors.find((f) => f.key === 'rainfall').status, 'outside');
});

test('notes: plain-language wording', () => {
  const rice = CROPS.find((c) => c.id === 'rice');
  const r = engine.scoreCrop(rice, { season: 'kharif', ph: 6, rainfall: 400, temperature: 28 });
  const rain = r.factors.find((f) => f.key === 'rainfall').note;
  assert.match(rain, /^Rainfall 400 mm is below ideal 1000–2000 mm/);
  const ph = r.factors.find((f) => f.key === 'ph').note;
  assert.match(ph, /within ideal/);
});

test('confidence: full input is Good with nothing missing', () => {
  const r = engine.recommend(FULL);
  assert.equal(r.confidence.level, 'Good');
  assert.equal(r.confidence.percent, 100);
  assert.deepEqual(r.confidence.missing, []);
});

test('confidence: sparse input is Low and lists missing inputs', () => {
  const r = engine.recommend({ season: 'kharif', ph: 6.5, rainfall: 800, temperature: 27 });
  assert.equal(r.confidence.level, 'Low');
  assert.ok(r.confidence.missing.includes('Soil'));
  assert.ok(r.confidence.missing.includes('Humidity'));
  assert.ok(r.warnings.some((w) => /low confidence/i.test(w)));
});

test('confidence: thresholds Good >= 80%, Moderate >= 55%', () => {
  // drop humidity (0.75) and soil (1.5): 9/11.25 = 80% -> Good
  assert.equal(engine.confidenceFor({ season: 'kharif', ph: 1, n: 1, p: 1, k: 1, rainfall: 1, temperature: 1 }).level, 'Good');
  // season + ph + rainfall + temperature + soil = 7.5/11.25 = 66.7% -> Moderate
  assert.equal(engine.confidenceFor({ season: 'kharif', soil: 'clay', ph: 1, rainfall: 1, temperature: 1 }).level, 'Moderate');
});

test('ranking: results sorted by score descending with ranks', () => {
  const r = engine.recommend(FULL);
  assert.equal(r.results.length, 12);
  for (let i = 1; i < r.results.length; i++) assert.ok(r.results[i - 1].score >= r.results[i].score);
  assert.equal(r.results[0].rank, 1);
});

for (const p of profiles.filter((x) => x.expected)) {
  test(`profile: ${p.name} ranks ${p.expected} first`, () => {
    const r = engine.recommend(p.input);
    assert.equal(r.results[0].id, p.expected);
    assert.equal(r.confidence.level, 'Good');
  });
}

test('profile: sparse input gives a low-confidence warning and no expected crop', () => {
  const sparse = profiles.find((p) => p.expected === null);
  assert.ok(sparse, 'sparse profile exists');
  const r = engine.recommend(sparse.input);
  assert.equal(r.confidence.level, 'Low');
  assert.ok(r.warnings.length > 0);
});

test('compare: returns per-factor rows and the best crop', () => {
  const c = engine.compare(FULL, ['rice', 'cotton']);
  assert.equal(c.crops.length, 2);
  assert.equal(c.rows.length, 9); // 7 numeric + season + soil
  assert.equal(c.best.id, 'rice');
  const soilRow = c.rows.find((r) => r.key === 'soil');
  assert.equal(soilRow.best, 'rice');
  assert.equal(c.rows[0].cells.length, 2);
});

test('compare: accepts three crops, rejects fewer, more, duplicates and unknown ids', () => {
  assert.equal(engine.compare(FULL, ['rice', 'cotton', 'maize']).crops.length, 3);
  assert.throws(() => engine.compare(FULL, ['rice']), engine.InputError);
  assert.throws(() => engine.compare(FULL, ['rice', 'cotton', 'maize', 'wheat']), engine.InputError);
  assert.throws(() => engine.compare(FULL, ['rice', 'rice']), engine.InputError);
  assert.throws(() => engine.compare(FULL, ['rice', 'unicorn']), engine.InputError);
  assert.throws(() => engine.compare(FULL, undefined), engine.InputError);
});

test('crop table: 12 crops with ordered ranges, known seasons and soils', () => {
  assert.equal(CROPS.length, 12);
  for (const c of CROPS) {
    for (const key of ['ph', 'n', 'p', 'k', 'rainfall', 'temperature', 'humidity']) {
      const [hl, il, ih, hh] = [c.ranges[key][2], c.ranges[key][0], c.ranges[key][1], c.ranges[key][3]];
      assert.ok(hl <= il && il <= ih && ih <= hh, `${c.id}.${key} range ordered`);
    }
    assert.ok(c.seasons.length > 0 && c.seasons.every((s) => SEASONS.includes(s)));
    assert.ok(c.soils.length > 0 && c.soils.every((s) => SOILS.includes(s)));
  }
});
