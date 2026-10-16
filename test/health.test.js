import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { healthInfo } from '../server/health.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('healthInfo returns exactly the keys ok and version', () => {
  assert.deepEqual(Object.keys(healthInfo()).sort(), ['ok', 'version']);
});

test('healthInfo reports ok === true', () => {
  assert.equal(healthInfo().ok, true);
});

test('healthInfo version matches package.json', () => {
  assert.equal(healthInfo().version, pkg.version);
});

test('healthInfo returns independent objects per call', () => {
  const first = healthInfo();
  first.ok = false;
  first.version = 'mutated';
  const second = healthInfo();
  assert.notEqual(first, second);
  assert.deepEqual(second, { ok: true, version: pkg.version });
});
