'use strict';

const express = require('express');
const path = require('path');
const engine = require('./src/engine');
const { CROPS, SEASONS, SOILS, DATA_LABEL } = require('./src/crops');

const DISCLAIMER =
  'Advisory only. Based on a sample, unvalidated crop table; not agronomic advice. ' +
  'Confirm with a local agricultural officer or a soil test before planting.';

function securityHeaders(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function makeRateLimiter(max, windowMs) {
  const hits = new Map(); // ip -> { count, resetAt }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
  }, windowMs);
  timer.unref();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    let h = hits.get(ip);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + windowMs };
      hits.set(ip, h);
    }
    h.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - h.count)));
    if (h.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((h.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }
    next();
  };
}

function createApp(opts = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use('/api', makeRateLimiter(opts.rateLimitMax || 60, opts.windowMs || 60 * 1000));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/meta', (req, res) => {
    res.json({
      app: 'Crop Advisor',
      problem: 'HACK-P302',
      dataLabel: DATA_LABEL,
      disclaimer: DISCLAIMER,
      fields: engine.FIELDS.map(({ key, label, unit, min, max }) => ({ key, label, unit, min, max })),
      seasons: SEASONS,
      soils: SOILS,
      crops: CROPS.map((c) => ({ id: c.id, name: c.name })),
      limits: { minNumericInputs: engine.MIN_NUMERIC, maxCompare: 3, minCompare: 2 }
    });
  });

  app.post('/api/recommend', (req, res) => {
    res.json(engine.recommend(req.body));
  });

  app.post('/api/compare', (req, res) => {
    const body = req.body;
    const ids = body && typeof body === 'object' ? body.crops : undefined;
    res.json(engine.compare(body, ids));
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, index: 'index.html' }));

  // Generic error handler: never leaks stack traces.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof engine.InputError) {
      return res.status(err.status).json({ error: err.message, fields: err.fields });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body.' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large (max 10kb).' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Crop Advisor listening on http://localhost:${port}`);
  });
}

module.exports = { createApp };
