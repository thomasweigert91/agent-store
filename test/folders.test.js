import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFolder, pickFolderScript, resolveWorkdir, riskyFolder, addRecent } from '../server/folders.js';

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

// spawn rejects NUL bytes in env synchronously, so no dialog opens here.
test('pickFolder releases the lock when spawn throws', { skip: process.platform !== 'win32' }, async () => {
  const bad = 'C:' + String.fromCharCode(0) + 'x';
  for (let i = 0; i < 2; i++) {
    await assert.rejects(pickFolder(bad), (err) => err.status === 400);
  }
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

const env = { home: 'C:\\Users\\me', systemDirs: ['C:\\Windows', 'C:\\Program Files'] };

test('riskyFolder flags drive roots, the profile and system folders', () => {
  assert.equal(riskyFolder('D:\\', env), 'Laufwerkswurzel');
  assert.equal(riskyFolder('d:', env), 'Laufwerkswurzel');
  assert.equal(riskyFolder('/', env), 'Laufwerkswurzel');
  assert.equal(riskyFolder('C:\\Users\\me\\', env), 'gesamtes Benutzerprofil');
  assert.equal(riskyFolder('c:/windows/system32', env), 'System- oder Programmordner');
  assert.equal(riskyFolder('C:\\Program Files\\App', env), 'System- oder Programmordner');
});

test('riskyFolder accepts normal project folders', () => {
  assert.equal(riskyFolder('D:\\agent-store', env), null);
  assert.equal(riskyFolder('C:\\Users\\me\\code\\tool', env), null);
  assert.equal(riskyFolder('C:\\Program Files Extra', env), null);
});

test('addRecent puts the newest first without duplicates', () => {
  assert.deepEqual(addRecent(['A', 'B'], 'b'), ['b', 'A']);
  assert.deepEqual(addRecent(['A'], ''), ['A']);
  assert.deepEqual(addRecent(undefined, 'X'), ['X']);
  assert.deepEqual(addRecent(['1', '2', '3'], '4', 3), ['4', '1', '2']);
});
