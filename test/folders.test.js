import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFolderScript } from '../server/folders.js';

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
