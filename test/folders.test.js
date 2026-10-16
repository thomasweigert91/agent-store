import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFolderScript, resolveWorkdir } from '../server/folders.js';

test('pickFolderScript uses FolderBrowserDialog with a topmost owner', () => {
  const script = pickFolderScript();
  assert.ok(script.includes('FolderBrowserDialog'));
  assert.ok(script.includes('TopMost'));
});

test('pickFolderScript reads the start folder only from the environment', () => {
  const script = pickFolderScript();
  assert.equal(pickFolderScript.length, 0);
  assert.ok(script.includes('$env:AGENT_STORE_PICK_START'));
  assert.ok(!script.includes('${'));
  assert.ok(!script.includes('$args'));
});

const fallback = 'F';

test('resolveWorkdir prefers the project repo', () => {
  assert.deepEqual(resolveWorkdir({ repo: 'R', workdir: 'W', fallback, exists: () => true }), { cwd: 'R' });
});

test('resolveWorkdir reports a missing repo without falling back', () => {
  const res = resolveWorkdir({ repo: 'R', workdir: 'W', fallback, exists: (p) => p !== 'R' });
  assert.ok(res.error.includes('Codebase-Ordner fehlt'));
  assert.ok(res.error.includes('R'));
  assert.equal('cwd' in res, false);
});

test('resolveWorkdir uses the agent workdir without repo', () => {
  assert.deepEqual(resolveWorkdir({ repo: '', workdir: 'W', fallback, exists: () => true }), { cwd: 'W' });
});

test('resolveWorkdir falls back when the workdir is missing', () => {
  assert.deepEqual(resolveWorkdir({ repo: '', workdir: 'W', fallback, exists: () => false }), { cwd: 'F' });
});

test('resolveWorkdir falls back without repo and workdir', () => {
  assert.deepEqual(resolveWorkdir({ repo: '', workdir: '', fallback, exists: () => true }), { cwd: 'F' });
});
