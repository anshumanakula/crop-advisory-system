'use strict';

// Runs the test suite and writes TEST_REPORT.md (results + example-profile table).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../src/engine');
const { profiles } = require('../public/profiles.json');

const root = path.join(__dirname, '..');

function runTests() {
  let r = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: root, encoding: 'utf8' });
  if (/bad option|unknown option|not allowed in NODE_OPTIONS/i.test(r.stderr || '')) {
    r = spawnSync(process.execPath, ['--test'], { cwd: root, encoding: 'utf8' });
  }
  return r;
}

const run = runTests();
const out = run.stdout || '';
const lines = out.split('\n');

const results = [];
for (const line of lines) {
  const m = /^(not ok|ok) \d+ - (.*?)(?: # .*)?$/.exec(line); // top-level lines only (no indentation)
  if (m) results.push({ pass: m[1] === 'ok', name: m[2] });
}
const num = (label) => {
  const m = new RegExp('^# ' + label + ' (\\d+)', 'm').exec(out);
  return m ? Number(m[1]) : 0;
};
const total = num('tests') || results.length;
const passed = num('pass');
const failed = num('fail');

const profileRows = profiles.map((p) => {
  const rec = engine.recommend(p.input);
  const top = rec.results[0];
  const second = rec.results[1];
  let verdict;
  if (p.expected) verdict = top.id === p.expected ? 'PASS' : 'FAIL';
  else verdict = rec.confidence.level === 'Low' && rec.warnings.length ? 'PASS (low-confidence warning shown)' : 'FAIL';
  return `| ${p.name} | ${p.expected || '—'} | ${top.name} (${top.score}) | ${second.name} (${second.score}) | ${rec.confidence.level} ${rec.confidence.percent}% | ${verdict} |`;
});

const md = [
  '# Test report: Crop Advisor (HACK-P302)',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Node: ${process.version}`,
  '',
  '## Summary',
  '',
  `- Tests: ${total}`,
  `- Passed: ${passed}`,
  `- Failed: ${failed}`,
  `- Result: ${failed === 0 && run.status === 0 ? 'PASS' : 'FAIL'}`,
  '',
  '## Example profiles',
  '',
  '| Profile | Expected #1 | Actual #1 (score) | #2 (score) | Confidence | Verdict |',
  '|---|---|---|---|---|---|',
  ...profileRows,
  '',
  '## Test cases',
  '',
  ...results.map((r) => `- [${r.pass ? 'x' : ' '}] ${r.name}`),
  '',
  '## Notes',
  '',
  '- Crop ranges are a sample table, unvalidated. Passing tests show the engine behaves as specified, not that the agronomy is correct.',
  '- Browser behaviour (compare table after "Get recommendation") is checked separately by a headless Chrome run, described in README.md.',
  ''
].join('\n');

fs.writeFileSync(path.join(root, 'TEST_REPORT.md'), md);
console.log(`TEST_REPORT.md written: ${passed}/${total} passed`);
process.exit(failed === 0 && run.status === 0 ? 0 : 1);
