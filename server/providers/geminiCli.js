// Gemini über dein Google-AI-Pro-Abo: nutzt die Gemini CLI (Login mit Google-Konto).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runLines, execQuick, AbortedError } from './proc.js';
import { buildTranscriptPrompt, dialogHistory } from './shared.js';

const IS_WIN = process.platform === 'win32';

export const info = {
  id: 'gemini-cli',
  label: 'Gemini (Abo via Gemini CLI)',
  short: 'Gemini',
  modelSuggestions: ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  defaultModel: '',
};

let resolved = null;      // { cmd, baseArgs, shell }
let supportsStreamJson = false;

// Unter Windows ist "gemini" ein npm-.cmd-Shim. Wir starten das JS-Entry direkt mit Node,
// damit keine Shell nötig ist (sauberes Quoting, sauberes Abbrechen).
async function resolveCommand() {
  const finder = IS_WIN ? 'where' : 'which';
  const r = await execQuick(finder, ['gemini']);
  if (!r.ok) return null;
  const candidates = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const c of candidates) {
    const dir = path.dirname(c);
    const pkgDir = path.join(dir, 'node_modules', '@google', 'gemini-cli');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.gemini;
      if (bin) {
        const entry = path.join(pkgDir, bin);
        if (fs.existsSync(entry)) return { cmd: process.execPath, baseArgs: [entry], shell: false };
      }
    } catch { /* weiter probieren */ }
  }
  const first = candidates.find((c) => /\.(cmd|bat)$/i.test(c)) || candidates[0];
  return { cmd: first, baseArgs: [], shell: IS_WIN };
}

export async function detect() {
  resolved = await resolveCommand();
  if (!resolved) {
    return { available: false, hint: 'Gemini CLI nicht gefunden. Installieren: npm install -g @google/gemini-cli – danach einmal "gemini" starten und "Login with Google" wählen.' };
  }
  const v = await execQuick(resolved.cmd, [...resolved.baseArgs, '--version'], { shell: resolved.shell });
  const h = await execQuick(resolved.cmd, [...resolved.baseArgs, '--help'], { shell: resolved.shell });
  supportsStreamJson = /stream-json/.test(h.stdout + h.stderr);
  if (!v.ok) return { available: false, hint: 'Gemini CLI gefunden, startet aber nicht: ' + (v.stderr || v.err?.message || '').slice(0, 200) };
  const version = v.stdout.trim().split('\n')[0];
  if (!hasAuth()) {
    return { available: false, installed: true, version, hint: `Gemini CLI ${version} installiert, aber noch nicht eingeloggt. Starte gemini-login.bat und wähle "Login with Google".` };
  }
  return { available: true, version, streamJson: supportsStreamJson };
}

// Hat die CLI eine Anmeldung? (Google-Login → oauth_creds.json bzw. selectedType in settings.json)
function hasAuth() {
  const dir = path.join(os.homedir(), '.gemini');
  if (fs.existsSync(path.join(dir, 'oauth_creds.json'))) return true;
  try {
    const s = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
    if (/selectedType|selectedAuthType/.test(s)) return true;
  } catch { /* keine settings */ }
  return Boolean(process.env.GOOGLE_GENAI_USE_GCA || process.env.GOOGLE_GENAI_USE_VERTEXAI);
}

const APPROVAL = { safe: [], edits: ['--approval-mode', 'auto_edit'], auto: ['--approval-mode', 'auto_edit'], full: ['--yolo'] };

export async function run({ agent, prompt, persona, history, cwd, signal, onEvent, settings }) {
  if (!resolved) await detect();
  if (!resolved) throw new Error('Gemini CLI ist nicht installiert (npm install -g @google/gemini-cli).');

  const args = [...resolved.baseArgs];
  if (supportsStreamJson) args.push('--output-format', 'stream-json');
  if (agent.model) args.push('-m', agent.model);
  args.push(...(APPROVAL[agent.autonomy] || []));
  // -p erzwingt den Headless-Modus; der Text wird an den Prompt aus stdin angehängt.
  args.push('-p', 'Bearbeite den neuen Auftrag oben.');
  if (resolved.shell) {
    // Shell-Modus (Fallback): nur harmlose Argumente erlauben.
    for (const a of args) if (!/^[\w.\-:/\\=]+$/.test(a)) throw new Error('Ungültiges Argument für Gemini CLI: ' + a);
  }

  const fullPrompt = buildTranscriptPrompt({
    persona,
    history: dialogHistory(history, settings.historyTurnsForStateless),
    prompt,
  });

  let text = '';
  let resultEvent = null;
  let errorEvent = null;
  onEvent({ type: 'activity', text: '🚀 Gemini startet…' });

  const { code, stderr } = await runLines({
    cmd: resolved.cmd, args, cwd, input: fullPrompt, signal, shell: resolved.shell,
    onLine: (line) => {
      let msg = null;
      if (supportsStreamJson && line.startsWith('{')) {
        try { msg = JSON.parse(line); } catch { msg = null; }
      }
      if (!msg) {
        // Klartext-Modus: jede Zeile ist Antwort-Text.
        if (!text) onEvent({ type: 'activity', text: '✍️ schreibt…' });
        const chunk = (text ? '\n' : '') + line;
        text += chunk;
        onEvent({ type: 'delta', text: chunk });
        return;
      }
      switch (msg.type) {
        case 'init':
          onEvent({ type: 'activity', text: `🚀 ${msg.model || 'Gemini'} bereit` });
          break;
        case 'message':
          if (msg.role === 'assistant' && msg.content) {
            if (!text) onEvent({ type: 'activity', text: '✍️ schreibt…' });
            text += msg.content;
            onEvent({ type: 'delta', text: msg.content });
          }
          break;
        case 'tool_use': {
          const p = msg.parameters || {};
          const detail = p.command || p.file_path || p.absolute_path || p.path || p.pattern || p.query || p.url || '';
          onEvent({ type: 'activity', text: `🔧 ${msg.tool_name || 'Werkzeug'}${detail ? ': ' + String(detail).slice(0, 80) : ''}`, tool: true });
          break;
        }
        case 'tool_result':
          onEvent({ type: 'activity', text: '📥 Werkzeug-Ergebnis erhalten' });
          break;
        case 'error':
          errorEvent = msg;
          onEvent({ type: 'activity', text: '⚠️ ' + String(msg.message || 'Fehler').slice(0, 100) });
          break;
        case 'result':
          resultEvent = msg;
          break;
        default:
          break;
      }
    },
  });

  if (signal?.aborted) throw new AbortedError();
  const failed = code !== 0 || resultEvent?.status === 'error';
  if (failed && !text.trim()) {
    let reason = resultEvent?.error?.message || errorEvent?.message || stderr.trim() || `Gemini CLI beendet mit Code ${code}`;
    if (/auth|login|credential|GEMINI_API_KEY/i.test(reason)) {
      reason += '\n\n👉 Tipp: Starte einmal "gemini" in einem Terminal und wähle "Login with Google" mit deinem Google-AI-Pro-Konto.';
    }
    throw new Error(String(reason).slice(0, 2000));
  }
  return { text: text.trim(), usage: resultEvent?.stats };
}
