// Git für die Codebase eines Projekts: Status, Commit und Push auf Klick – nie force, Secrets werden blockiert.
import { execFile } from 'node:child_process';

const TIMEOUT_MS = 2 * 60 * 1000;
export const PROTECTED_BRANCHES = ['main', 'master'];

// Dateien, die nie committet werden dürfen (Pfad relativ zum Repo, mit / getrennt).
const SECRET_PATHS = [
  /(^|\/)\.env$/i,
  /(^|\/)\.env\.(?!example$|sample$|template$)[^/]+$/i,
  /(^|\/)data\/settings\.json$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)credentials(\.json)?$/i,
];

// Typische Schlüssel im Inhalt (nur hinzugefügte Zeilen werden geprüft).
const SECRET_CONTENT = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const busy = new Set(); // Repos mit laufender Git-Aktion

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function git(repo, args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: repo,
      timeout: TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message).trim().split('\n').slice(-6).join('\n');
        return reject(fail(err.code === 'ENOENT' ? 501 : 400, err.code === 'ENOENT' ? 'Git ist nicht installiert.' : msg));
      }
      resolve({ stdout, stderr });
    });
  });
}

// Nur eine Git-Aktion pro Repo gleichzeitig (Status-Abfragen ausgenommen).
async function exclusive(repo, fn) {
  if (busy.has(repo)) throw fail(409, 'Im Repo läuft gerade schon eine Git-Aktion.');
  busy.add(repo);
  try { return await fn(); } finally { busy.delete(repo); }
}

export const isProtected = (branch) => PROTECTED_BRANCHES.includes(branch);

// Erste Zeile von `git status --porcelain=v1 -b`: "## main...origin/main [ahead 1, behind 2]".
export function parseBranchLine(line) {
  const out = { branch: null, upstream: null, ahead: 0, behind: 0 };
  const m = /^## (.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(line || '');
  if (!m) return out;
  if (m[1].startsWith('No commits yet on ')) out.branch = m[1].slice('No commits yet on '.length);
  else if (!m[1].startsWith('HEAD (no branch)')) out.branch = m[1];
  out.upstream = m[2] || null;
  out.ahead = Number(/ahead (\d+)/.exec(m[3] || '')?.[1] || 0);
  out.behind = Number(/behind (\d+)/.exec(m[3] || '')?.[1] || 0);
  return out;
}

// `git status --porcelain=v1 -z -uall`: Einträge "XY pfad\0", Umbenennungen mit zusätzlichem "alter-pfad\0".
export function parseStatusZ(text) {
  const parts = text.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const code = e.slice(0, 2);
    files.push({ code, path: e.slice(3) });
    if (code[0] === 'R' || code[0] === 'C') i++;
  }
  return files;
}

export function findSecretPaths(paths) {
  return paths.filter((p) => SECRET_PATHS.some((re) => re.test(p.replace(/\\/g, '/'))));
}

export function findSecretContent(diff) {
  const hits = new Set();
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.replace(/^\+\+\+ (b\/)?/, '');
    else if (line.startsWith('+') && SECRET_CONTENT.some((re) => re.test(line))) hits.add(file);
  }
  return [...hits];
}

// GitHub/GitLab melden beim ersten Push einen Link zum Pull Request.
export function prLink(output) {
  return /(https:\/\/\S+\/(?:pull\/new|merge_requests\/new)\S*)/.exec(output || '')?.[1] || null;
}

export async function status(repo) {
  try {
    await git(repo, ['rev-parse', '--is-inside-work-tree']);
  } catch (err) {
    if (err.status === 501) throw err;
    return { isRepo: false };
  }
  const [head, files, log, remote] = await Promise.all([
    git(repo, ['status', '--porcelain=v1', '-b']),
    git(repo, ['status', '--porcelain=v1', '-z', '-uall']),
    git(repo, ['log', '-5', '--format=%h%x09%s']).catch(() => ({ stdout: '' })),
    git(repo, ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' })),
  ]);
  const b = parseBranchLine(head.stdout.split('\n')[0]);
  return {
    isRepo: true,
    ...b,
    protected: b.branch ? isProtected(b.branch) : false,
    remote: remote.stdout.trim() || null,
    files: parseStatusZ(files.stdout).slice(0, 200),
    commits: log.stdout.trim().split('\n').filter(Boolean).map((l) => {
      const [hash, ...rest] = l.split('\t');
      return { hash, subject: rest.join('\t') };
    }),
  };
}

// Alle Änderungen committen. Secrets (Pfade oder Schlüssel im Inhalt) brechen den Commit ab.
export function commit(repo, message) {
  const msg = String(message || '').trim().slice(0, 2000);
  if (!msg) throw fail(400, 'Bitte eine Commit-Nachricht angeben.');
  return exclusive(repo, async () => {
    const files = parseStatusZ((await git(repo, ['status', '--porcelain=v1', '-z', '-uall'])).stdout);
    if (!files.length) throw fail(400, 'Keine Änderungen zum Committen.');
    const badPaths = findSecretPaths(files.map((f) => f.path));
    if (badPaths.length) throw fail(400, `Commit blockiert – mögliche Secrets: ${badPaths.join(', ')}. Bitte in .gitignore aufnehmen.`);
    await git(repo, ['add', '-A']);
    const badContent = findSecretContent((await git(repo, ['diff', '--cached', '-U0', '--no-color'])).stdout);
    if (badContent.length) {
      // Zurück auf den Stand vor dem Commit-Versuch: nichts gestaged, Dateien unverändert.
      await git(repo, ['reset', '-q']);
      throw fail(400, `Commit blockiert – Schlüssel im Inhalt gefunden: ${badContent.join(', ')}.`);
    }
    await git(repo, ['commit', '-q', '-m', msg]);
    const { stdout } = await git(repo, ['log', '-1', '--format=%h%x09%s']);
    const [hash, ...rest] = stdout.trim().split('\t');
    return { hash, subject: rest.join('\t') };
  });
}

// Aktuellen Branch nach origin pushen (mit -u, nie force). main/master nur mit ausdrücklicher Bestätigung.
export function push(repo, { confirmProtected = false } = {}) {
  return exclusive(repo, async () => {
    const s = await status(repo);
    if (!s.isRepo) throw fail(400, 'Der Codebase-Ordner ist kein Git-Repo.');
    if (!s.branch) throw fail(400, 'Kein Branch ausgecheckt (detached HEAD).');
    if (!s.remote) throw fail(400, 'Kein Remote „origin“ eingerichtet.');
    if (s.protected && !confirmProtected) throw fail(409, `„${s.branch}“ ist geschützt – Push nur mit ausdrücklicher Bestätigung.`);
    const { stdout, stderr } = await git(repo, ['push', '--porcelain', '-u', 'origin', `HEAD:refs/heads/${s.branch}`]);
    const output = `${stdout}\n${stderr}`.trim();
    return { branch: s.branch, output: output.slice(-4000), prLink: prLink(output) };
  });
}
