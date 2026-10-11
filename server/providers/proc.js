// Hilfsfunktionen zum Starten/Abbrechen von CLI-Prozessen (Claude Code, Gemini CLI).
import { spawn, execFile } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

// Env für CLI-Kinder: API-Keys entfernen, damit die CLIs dein Abo-Login nutzen
// statt auf einen (evtl. vorhandenen) API-Key umzuschalten.
export function cliEnv() {
  const env = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) {
    delete env[k];
  }
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  return env;
}

export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  } else {
    try { child.kill('SIGTERM'); } catch { /* bereits beendet */ }
  }
}

/**
 * Startet einen Prozess, schreibt `input` auf stdin und liefert stdout zeilenweise an onLine.
 * Resolved mit { code, stderr }. Bricht bei signal.abort() den gesamten Prozessbaum ab.
 */
export function runLines({ cmd, args, cwd, input, signal, onLine, shell = false }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: cliEnv(), shell, windowsHide: true });
    } catch (err) {
      return reject(err);
    }
    let buf = '';
    let stderr = '';
    const onAbort = () => killTree(child);
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (line.length) onLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
    });
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (buf.trim()) onLine(buf.replace(/\r$/, ''));
      resolve({ code, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

export function execQuick(cmd, args, { shell = false, timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, shell, windowsHide: true, env: cliEnv() }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), err });
    });
  });
}

export class AbortedError extends Error {
  constructor() { super('Abgebrochen'); this.aborted = true; }
}
