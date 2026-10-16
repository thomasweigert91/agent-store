import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseBranchLine, parseStatusZ, findSecretPaths, findSecretContent, prLink, isProtected, status, commit, push } from '../server/git.js';

test('parseBranchLine reads branch, upstream and ahead/behind', () => {
  assert.deepEqual(parseBranchLine('## main...origin/main [ahead 2, behind 1]'), { branch: 'main', upstream: 'origin/main', ahead: 2, behind: 1 });
  assert.deepEqual(parseBranchLine('## agent/x'), { branch: 'agent/x', upstream: null, ahead: 0, behind: 0 });
  assert.equal(parseBranchLine('## No commits yet on main').branch, 'main');
  assert.equal(parseBranchLine('## HEAD (no branch)').branch, null);
});

test('parseStatusZ handles spaces and renames', () => {
  const files = parseStatusZ(' M a b.txt\0R  new.js\0old.js\0?? x.md\0');
  assert.deepEqual(files, [
    { code: ' M', path: 'a b.txt' },
    { code: 'R ', path: 'new.js' },
    { code: '??', path: 'x.md' },
  ]);
});

test('findSecretPaths blocks env files and keys but not examples', () => {
  const hits = findSecretPaths(['.env', 'sub/.env.local', '.env.example', 'data/settings.json', 'certs/server.key', 'server/index.js']);
  assert.deepEqual(hits, ['.env', 'sub/.env.local', 'data/settings.json', 'certs/server.key']);
});

test('findSecretContent only checks added lines', () => {
  const key = 'sk-ant-' + 'a'.repeat(30);
  const diff = `+++ b/config.js\n+const k = '${key}';\n+++ b/old.js\n-const k = '${key}';\n`;
  assert.deepEqual(findSecretContent(diff), ['config.js']);
});

test('prLink finds the GitHub pull request link', () => {
  const out = 'remote: Create a pull request for \'agent/x\' on GitHub by visiting:\nremote:      https://github.com/u/r/pull/new/agent/x\n';
  assert.equal(prLink(out), 'https://github.com/u/r/pull/new/agent/x');
  assert.equal(prLink('Everything up-to-date'), null);
});

test('main and master are protected', () => {
  assert.ok(isProtected('main'));
  assert.ok(isProtected('master'));
  assert.ok(!isProtected('agent/main-fix'));
});

// Echter Ablauf gegen ein temporäres Repo mit lokalem Bare-Remote.
function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-store-git-'));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  sh(root, 'init', '-q', '--bare', remote);
  sh(root, 'init', '-q', '-b', 'main', repo);
  sh(repo, 'config', 'user.name', 'Test');
  sh(repo, 'config', 'user.email', 'test@example.invalid');
  sh(repo, 'config', 'core.autocrlf', 'false');
  sh(repo, 'remote', 'add', 'origin', remote);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'init');
  return { root, repo, remote };
}

test('commit and push a feature branch, protect main', async (t) => {
  const { root, repo, remote } = tempRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await assert.rejects(push(repo), (e) => e.status === 409);
  await push(repo, { confirmProtected: true });
  assert.ok(sh(remote, 'branch', '--list', 'main').includes('main'));

  sh(repo, 'switch', '-q', '-c', 'agent/demo');
  fs.writeFileSync(path.join(repo, 'b c.txt'), 'b\n');
  const s1 = await status(repo);
  assert.equal(s1.branch, 'agent/demo');
  assert.deepEqual(s1.files.map((f) => f.path), ['b c.txt']);

  const c = await commit(repo, 'feat: add b');
  assert.equal(c.subject, 'feat: add b');
  await assert.rejects(commit(repo, 'nothing'), /Keine Änderungen/);

  const r = await push(repo);
  assert.equal(r.branch, 'agent/demo');
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'agent/demo').trim(), 'feat: add b');
  const s2 = await status(repo);
  assert.equal(s2.upstream, 'origin/agent/demo');
  assert.equal(s2.ahead, 0);
});

test('commit refuses secrets and leaves nothing staged', async (t) => {
  const { root, repo } = tempRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.writeFileSync(path.join(repo, '.env'), 'X=1\n');
  await assert.rejects(commit(repo, 'oops'), /mögliche Secrets: \.env/);
  fs.rmSync(path.join(repo, '.env'));

  fs.writeFileSync(path.join(repo, 'cfg.js'), `export const k = 'ghp_${'x'.repeat(36)}';\n`);
  await assert.rejects(commit(repo, 'oops'), /Schlüssel im Inhalt gefunden: cfg\.js/);
  assert.equal(sh(repo, 'diff', '--cached', '--name-only').trim(), '');
  assert.equal(sh(repo, 'log', '--format=%s').trim(), 'init');
});

test('status reports a folder that is not a repo', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-store-nogit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(await status(dir), { isRepo: false });
});
