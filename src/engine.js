'use strict';

const { CROPS, SEASONS, SOILS, DATA_LABEL } = require('./crops');

// Numeric input fields. Limits are validation bounds; weights drive scoring.
const FIELDS = [
  { key: 'ph', label: 'pH', unit: '', min: 3, max: 10, weight: 1.5 },
  { key: 'n', label: 'Nitrogen (N)', unit: 'kg/ha', min: 0, max: 300, weight: 1 },
  { key: 'p', label: 'Phosphorus (P)', unit: 'kg/ha', min: 0, max: 200, weight: 1 },
  { key: 'k', label: 'Potassium (K)', unit: 'kg/ha', min: 0, max: 300, weight: 1 },
  { key: 'rainfall', label: 'Rainfall', unit: 'mm', min: 0, max: 5000, weight: 1.5 },
  { key: 'temperature', label: 'Temperature', unit: '°C', min: -5, max: 50, weight: 1.5 },
  { key: 'humidity', label: 'Humidity', unit: '%', min: 0, max: 100, weight: 0.75 }
];

const SEASON_WEIGHT = 1.5;
const SOIL_WEIGHT = 1.5;
const SOIL_MISMATCH_SCORE = 0.3;
const MIN_NUMERIC = 3;
const TOTAL_WEIGHT = FIELDS.reduce((s, f) => s + f.weight, 0) + SEASON_WEIGHT + SOIL_WEIGHT;

const CATEGORY_ORDER = ['Poor', 'Low', 'Moderate', 'High'];

class InputError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = 'InputError';
    this.status = 400;
    this.fields = fields || {};
  }
}

const NUM_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// Returns { ok, errors, values }. Blank fields are "missing"; numeric strings are numbers.
function validate(input) {
  const errors = {};
  const values = {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { _form: 'Request body must be a JSON object.' }, values };
  }

  // Season (required)
  if (isBlank(input.season)) {
    errors.season = 'Season is required.';
  } else {
    const s = typeof input.season === 'string' ? input.season.trim().toLowerCase() : '';
    if (SEASONS.includes(s)) values.season = s;
    else errors.season = `Season must be one of: ${SEASONS.join(', ')}.`;
  }

  // Soil (optional)
  if (!isBlank(input.soil)) {
    const s = typeof input.soil === 'string' ? input.soil.trim().toLowerCase() : '';
    if (SOILS.includes(s)) values.soil = s;
    else errors.soil = `Soil must be one of: ${SOILS.join(', ')}.`;
  }

  // Numeric fields (optional individually)
  let numeric = 0;
  for (const f of FIELDS) {
    const raw = input[f.key];
    if (isBlank(raw)) continue;
    let num;
    if (typeof raw === 'number') num = raw;
    else if (typeof raw === 'string' && NUM_RE.test(raw.trim())) num = Number(raw.trim());
    else num = NaN;
    if (!Number.isFinite(num)) {
      errors[f.key] = `${f.label} must be a number.`;
      continue;
    }
    if (num < f.min || num > f.max) {
      errors[f.key] = `${f.label} must be between ${f.min} and ${f.max}${f.unit ? ' ' + f.unit : ''}.`;
      continue;
    }
    values[f.key] = num;
    numeric += 1;
  }

  if (Object.keys(errors).length === 0 && numeric < MIN_NUMERIC) {
    errors._form = `Enter at least ${MIN_NUMERIC} numeric values (got ${numeric}).`;
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}

// 1 inside ideal; linear decay to 0 at the hard edge; 0 beyond.
function rangeScore(v, range) {
  const [il, ih, hl, hh] = range;
  if (v >= il && v <= ih) return 1;
  if (v < il) return v <= hl ? 0 : (v - hl) / (il - hl);
  return v >= hh ? 0 : (hh - v) / (hh - ih);
}

function categoryFor(score) {
  if (score >= 80) return 'High';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Low';
  return 'Poor';
}

function confidenceFor(values) {
  let supplied = SEASON_WEIGHT; // season is always present after validation
  const missing = [];
  for (const f of FIELDS) {
    if (values[f.key] === undefined) missing.push(f.label);
    else supplied += f.weight;
  }
  if (values.soil === undefined) missing.push('Soil');
  else supplied += SOIL_WEIGHT;
  const ratio = supplied / TOTAL_WEIGHT;
  const level = ratio >= 0.8 ? 'Good' : ratio >= 0.55 ? 'Moderate' : 'Low';
  return { level, percent: Math.round(ratio * 100), missing };
}

function fmtVal(v, unit) {
  if (!unit) return String(v);
  return /^[°%]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`;
}

function numericNote(f, v, range) {
  const [il, ih, hl, hh] = range;
  const val = `${f.label} ${fmtVal(v, f.unit)}`;
  const ideal = `${il}–${fmtVal(ih, f.unit)}`;
  if (v >= il && v <= ih) return `${val} is within ideal ${ideal}`;
  const dir = v < il ? 'below' : 'above';
  if (v < hl || v > hh) {
    return `${val} is ${dir} ideal ${ideal} and outside the tolerable limit ${hl}–${fmtVal(hh, f.unit)}`;
  }
  return `${val} is ${dir} ideal ${ideal}`;
}

function scoreCrop(crop, values) {
  const factors = [];

  for (const f of FIELDS) {
    const v = values[f.key];
    if (v === undefined) continue;
    const range = crop.ranges[f.key];
    const score = rangeScore(v, range);
    const outside = v < range[2] || v > range[3];
    factors.push({
      key: f.key, label: f.label, value: v, score, weight: f.weight,
      status: outside ? 'outside' : score === 1 ? 'ideal' : 'marginal',
      note: numericNote(f, v, range)
    });
  }

  const seasonOk = crop.seasons.includes(values.season);
  factors.push({
    key: 'season', label: 'Season', value: values.season,
    score: seasonOk ? 1 : 0, weight: SEASON_WEIGHT,
    status: seasonOk ? 'ideal' : 'outside',
    note: seasonOk
      ? `Season ${values.season} suits ${crop.name}`
      : `Season ${values.season} does not suit ${crop.name} (grown in ${crop.seasons.join(', ')})`
  });

  if (values.soil !== undefined) {
    const soilOk = crop.soils.includes(values.soil);
    factors.push({
      key: 'soil', label: 'Soil', value: values.soil,
      score: soilOk ? 1 : SOIL_MISMATCH_SCORE, weight: SOIL_WEIGHT,
      status: soilOk ? 'ideal' : 'marginal',
      note: soilOk
        ? `Soil ${values.soil} suits ${crop.name}`
        : `Soil ${values.soil} is a weak match for ${crop.name} (suits ${crop.soils.join(', ')})`
    });
  }

  let weighted = 0;
  let wsum = 0;
  for (const f of factors) {
    weighted += f.score * f.weight;
    wsum += f.weight;
  }
  const score = round1((weighted / wsum) * 100);
  let category = categoryFor(score);
  const capped = factors.some((f) => f.status === 'outside');
  if (capped && CATEGORY_ORDER.indexOf(category) > CATEGORY_ORDER.indexOf('Low')) category = 'Low';

  return { id: crop.id, name: crop.name, score, category, capped, factors };
}

function checked(input) {
  const v = validate(input);
  if (!v.ok) {
    const first = Object.values(v.errors)[0];
    throw new InputError(first || 'Invalid input.', v.errors);
  }
  return v.values;
}

function recommend(input) {
  const values = checked(input);
  const results = CROPS.map((c) => scoreCrop(c, values));
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  results.forEach((r, i) => { r.rank = i + 1; });

  const confidence = confidenceFor(values);
  const warnings = [];
  if (confidence.level === 'Low') {
    warnings.push('Low confidence: too few inputs were supplied. Treat the ranking as indicative only.');
  }
  if (results.length > 1 && results[0].score === results[1].score) {
    warnings.push(`Tie at the top: ${results[0].name} and ${results[1].name} score equally on the inputs given.`);
  }
  if (results[0].category === 'Poor' || results[0].category === 'Low') {
    warnings.push('No crop is a strong match for these conditions.');
  }
  return { dataLabel: DATA_LABEL, input: values, confidence, warnings, results };
}

function compare(input, ids) {
  const values = checked(input);
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 3) {
    throw new InputError('Choose 2 or 3 crops to compare.', { crops: 'Choose 2 or 3 crops to compare.' });
  }
  if (new Set(ids).size !== ids.length) {
    throw new InputError('Crops to compare must be different.', { crops: 'Crops to compare must be different.' });
  }
  const scored = ids.map((id) => {
    const crop = CROPS.find((c) => c.id === id);
    if (!crop) throw new InputError(`Unknown crop: ${String(id).slice(0, 40)}`, { crops: 'Unknown crop id.' });
    return scoreCrop(crop, values);
  });

  const rows = scored[0].factors.map((f, i) => {
    const cells = scored.map((r) => {
      const fx = r.factors[i];
      return { id: r.id, score: fx.score, status: fx.status, note: fx.note };
    });
    const max = Math.max(...cells.map((c) => c.score));
    const winners = cells.filter((c) => c.score === max);
    return {
      key: f.key, label: f.label, cells,
      best: winners.length === 1 && cells.some((c) => c.score !== max) ? winners[0].id : null
    };
  });

  const top = Math.max(...scored.map((r) => r.score));
  const leaders = scored.filter((r) => r.score === top);
  return {
    crops: scored.map((r) => ({ id: r.id, name: r.name, score: r.score, category: r.category, capped: r.capped })),
    rows,
    best: { id: leaders[0].id, name: leaders[0].name, score: top, tie: leaders.length > 1 },
    confidence: confidenceFor(values)
  };
}

module.exports = {
  FIELDS, SEASON_WEIGHT, SOIL_WEIGHT, SOIL_MISMATCH_SCORE, TOTAL_WEIGHT, MIN_NUMERIC,
  InputError, validate, rangeScore, categoryFor, confidenceFor, scoreCrop, recommend, compare
};
