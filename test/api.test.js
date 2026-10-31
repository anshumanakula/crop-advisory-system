'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server');

const FULL = { season: 'kharif', soil: 'clay', ph: 6.2, n: 90, p: 45, k: 45, rainfall: 1500, temperature: 28, humidity: 80 };

function start(opts) {
  return new Promise((resolve) => {
    const server = http.createServer(createApp(opts)).listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function post(base, path, body, raw) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body)
  });
}

test('api: GET /api/meta lists fields, seasons, soils and 12 crops', async () => {
  const { server, base } = await start();
  try {
    const res = await fetch(base + '/api/meta');
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.crops.length, 12);
    assert.deepEqual(j.seasons, ['kharif', 'rabi', 'zaid']);
    assert.equal(j.soils.length, 6);
    assert.equal(j.fields.length, 7);
    assert.match(j.dataLabel, /sample, unvalidated/);
  } finally { server.close(); }
});

test('api: POST /api/recommend returns ranked results with confidence', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/recommend', FULL);
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.results[0].id, 'rice');
    assert.equal(j.confidence.level, 'Good');
    assert.equal(j.results.length, 12);
  } finally { server.close(); }
});

test('api: recommend accepts numeric strings and blank fields', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/recommend', { season: 'kharif', soil: '', ph: '6.5', rainfall: '800', temperature: '27', humidity: '' });
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.confidence.level, 'Low');
  } finally { server.close(); }
});

test('api: recommend returns 400 with field errors for invalid input', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/recommend', { season: '', ph: 99, rainfall: 'abc', temperature: 20 });
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.ok(j.fields.season);
    assert.ok(j.fields.ph);
    assert.ok(j.fields.rainfall);
  } finally { server.close(); }
});

test('api: POST /api/compare returns rows and best crop', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/compare', { ...FULL, crops: ['rice', 'sugarcane'] });
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.crops.length, 2);
    assert.equal(j.best.id, 'rice');
    assert.ok(j.rows.length >= 3);
  } finally { server.close(); }
});

test('api: compare returns 400 for a single crop or unknown crop', async () => {
  const { server, base } = await start();
  try {
    assert.equal((await post(base, '/api/compare', { ...FULL, crops: ['rice'] })).status, 400);
    assert.equal((await post(base, '/api/compare', { ...FULL, crops: ['rice', 'nope'] })).status, 400);
    assert.equal((await post(base, '/api/compare', FULL)).status, 400);
  } finally { server.close(); }
});

test('api: malformed JSON returns 400 without a stack trace', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/recommend', null, '{"season": "kharif",');
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.match(text, /Malformed JSON/);
    assert.doesNotMatch(text, /at .*\.js/);
  } finally { server.close(); }
});

test('api: body over 10kb is rejected with 413', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/recommend', { ...FULL, pad: 'x'.repeat(11 * 1024) });
    assert.equal(res.status, 413);
  } finally { server.close(); }
});

test('api: non-object JSON body returns 400', async () => {
  const { server, base } = await start();
  try {
    const res = await post(base, '/api/recommend', null, '[1,2,3]');
    assert.equal(res.status, 400);
  } finally { server.close(); }
});

test('api: security headers on pages and API responses', async () => {
  const { server, base } = await start();
  try {
    for (const path of ['/', '/api/meta']) {
      const res = await fetch(base + path);
      const csp = res.headers.get('content-security-policy');
      assert.ok(csp && csp.includes("default-src 'self'") && csp.includes("script-src 'self'"), `CSP on ${path}`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-powered-by'), null);
    }
  } finally { server.close(); }
});

test('api: rate limit returns 429 after the per-minute quota', async () => {
  const { server, base } = await start({ rateLimitMax: 5 });
  try {
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await fetch(base + '/api/meta')).status);
    assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.equal(codes[5], 429);
    const res = await fetch(base + '/api/meta');
    assert.ok(res.headers.get('retry-after'));
  } finally { server.close(); }
});

test('api: default rate limit is 60 requests per minute per IP', async () => {
  const { server, base } = await start();
  try {
    let last;
    for (let i = 0; i < 61; i++) last = (await fetch(base + '/api/meta')).status;
    assert.equal(last, 429);
  } finally { server.close(); }
});

test('api: unknown API route returns JSON 404', async () => {
  const { server, base } = await start();
  try {
    const res = await fetch(base + '/api/nothing');
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'Not found');
  } finally { server.close(); }
});

test('static: index page has no inline scripts and loads app.js', async () => {
  const { server, base } = await start();
  try {
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /<script src="app\.js"/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(html, /\son\w+="/);
  } finally { server.close(); }
});
