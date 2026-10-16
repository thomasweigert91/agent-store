// Gemini über dein Google-AI-Pro-Abo: nutzt die Antigravity CLI (agy), den Nachfolger der Gemini CLI.
// Google hat die Gemini CLI für Privat-/AI-Pro-Konten im Juni 2026 abgeschaltet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLines, execQuick, AbortedError } from './proc.js';

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? 'agy.exe' : 'agy';
// Windows-Kommandozeilen sind auf ~32k Zeichen begrenzt; längere Aufträge gehen über eine Datei.
const MAX_ARG_CHARS = 24000;

export const info = {
  id: 'antigravity-cli',
  label: 'Gemini (Abo via Antigravity)',
  short: 'Gemini',
  modelSuggestions: ['gemini-3.1-pro-high', 'gemini-3.1-pro-low', 'gemini-3.8-flash-high', 'gemini-3.8-flash-medium'],
  defaultModel: '',
};

let agyPath = null;

async function resolveAgy() {
  const r = await execQuick(IS_WIN ? 'where' : 'which', ['agy']);
  if (r.ok) {
    const first = r.stdout.split(/\r?\n/).map((s) => s.trim()).find((s) => /\.exe$/i.test(s) || !IS_WIN);
    if (first) return first;
  }
  const candidates = [
    path.join(os.homedir(), '.gemini', 'bin', EXE),
    path.join(os.homedir(), '.local', 'bin', EXE), // Linux-Installer (install.sh)
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity', 'bin', EXE),
    path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', EXE), // Windows-Installer (install.ps1)
    path.join(process.env.LOCALAPPDATA || '', 'Antigravity', EXE),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

export async function detect() {
  agyPath = await resolveAgy();
  if (!agyPath) {
    return { available: false, hint: 'Antigravity CLI (agy) nicht gefunden – die Antigravity-Desktop-App allein reicht nicht. In PowerShell installieren: irm https://antigravity.google/cli/install.ps1 | iex – danach antigravity-login.bat starten und mit Google anmelden.' };
  }
  const v = await execQuick(agyPath, ['--version']);
  if (!v.ok) return { available: false, hint: 'agy gefunden, startet aber nicht: ' + (v.stderr || v.err?.message || '').slice(0, 200) };
  const version = 'agy ' + v.stdout.trim().split('\n')[0];

  // "agy models" klappt nur mit gültigem Login – damit prüfen wir gleichzeitig die Anmeldung.
  const m = await execQuick(agyPath, ['models'], { timeout: 30000 });
  const models = m.stdout.split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter((id) => /^[\w.\-]+$/.test(id) && id !== 'Fetching');
  if (!m.ok || !models.length) {
    return { available: false, installed: true, version, hint: `${version} installiert, aber nicht angemeldet. Starte antigravity-login.bat und melde dich mit deinem Google-AI-Pro-Konto an.` };
  }
  return { available: true, version, modelSuggestions: models };
}

const PERMISSIONS = {
  safe: [],                                    // Lesen erlaubt, alles andere wird headless verweigert
  edits: ['--mode', 'accept-edits'],
  auto: ['--mode', 'accept-edits'],
  full: ['--dangerously-skip-permissions'],
};

function describeTool(name, params) {
  const p = params || {};
  const detail = p.CommandLine || p.AbsolutePath || p.TargetFile || p.FilePath || p.SearchPath || p.Query || p.Url || p.query || '';
  return `🔧 ${name}${detail ? ': ' + String(detail).slice(0, 80) : ''}`;
}

export async function run({ agent, prompt, persona, cwd, signal, onEvent, extraDirs = [] }) {
  if (!agyPath) await detect();
  if (!agyPath) throw new Error('Antigravity CLI (agy) ist nicht installiert.');

  const attempt = async (conversationId, followUp = null) => {
    // Rolle nur beim ersten Auftrag einer Unterhaltung mitschicken – danach kennt agy sie.
    let text = followUp || conversationId || !persona ? (followUp || prompt) : `# Deine Rolle\n${persona}\n\n# Auftrag\n${prompt}`;
    if (text.length > MAX_ARG_CHARS) {
      const dir = path.join(cwd, '.agent-store');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `auftrag-${Date.now()}.md`);
      fs.writeFileSync(file, text);
      text = `Lies die Datei ${file} vollständig und bearbeite den Auftrag darin.`;
    }

    const args = ['--output-format', 'stream-json', ...(PERMISSIONS[agent.autonomy] || [])];
    for (const dir of extraDirs) args.push('--add-dir', dir);
    if (agent.model) args.push('--model', agent.model);
    if (conversationId) args.push('--conversation', conversationId);
    args.push(`--print=${text}`);

    let out = '';
    let result = null;
    let newConversation = null;
    const notes = [];
    onEvent({ type: 'activity', text: '🚀 Antigravity startet…' });

    const { code, stderr } = await runLines({
      cmd: agyPath, args, cwd, signal,
      onLine: (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch {
          if (line.trim()) notes.push(line.trim());
          return;
        }
        if (msg.event === 'init' && msg.conversation_id) {
          newConversation = msg.conversation_id;
          onEvent({ type: 'session', id: msg.conversation_id });
        } else if (msg.event === 'step_update') {
          const s = msg.step_update || {};
          if (s.step_type === 'agent_response' && s.text_delta) {
            if (!out) onEvent({ type: 'activity', text: '✍️ schreibt…' });
            out += s.text_delta;
            onEvent({ type: 'delta', text: s.text_delta });
          } else if (s.step_type === 'agent_response' && s.state === 'ACTIVE' && !out) {
            onEvent({ type: 'activity', text: '🤔 denkt nach…' });
          } else if (s.step_type === 'tool' && s.state === 'ACTIVE') {
            onEvent({ type: 'activity', text: describeTool(s.tool_name, s.tool_info?.parameters), tool: true });
          } else if (s.step_type === 'tool' && s.state === 'ERROR') {
            onEvent({ type: 'activity', text: '⛔ ' + String(s.tool_info?.error?.message || `${s.tool_name} verweigert`).slice(0, 100) });
          } else if (s.step_type === 'tool' && s.state === 'DONE') {
            onEvent({ type: 'activity', text: '📥 Werkzeug-Ergebnis erhalten' });
          }
        } else if (msg.event === 'result') {
          result = msg.result || {};
        }
      },
    });

    if (signal?.aborted) throw new AbortedError();
    const denied = (result?.denied_actions || []).map((d) => d.display_name || d.action);
    const finalText = (out.trim() || String(result?.response || '').trim());
    if (result && result.status === 'SUCCESS' && finalText) {
      const hint = denied.length
        ? `\n\n> ⛔ Verweigert: ${denied.join(', ')} – erhöhe die Autonomie des Agents, wenn er das darf.`
        : '';
      return { text: finalText + hint, sessionId: result.conversation_id || newConversation, usage: result.usage };
    }
    let reason = result?.error?.message || result?.error || notes.join('\n') || stderr.trim() || `agy beendet mit Code ${code}`;
    if (denied.length) reason += `\n\nVerweigert: ${denied.join(', ')} – erhöhe die Autonomie des Agents (Ausrüstung), wenn er das darf.`;
    if (/auth|login|sign in|credential/i.test(reason)) reason += '\n\n👉 Tipp: Starte antigravity-login.bat und melde dich mit deinem Google-AI-Pro-Konto an.';
    const err = new Error(String(reason).slice(0, 2000));
    err.sessionMissing = Boolean(conversationId) && /conversation|not found/i.test(String(reason));
    // Ein Werkzeug wurde verweigert und es kam keine Antwort → in derselben Unterhaltung nachfassen.
    err.deniedEmpty = denied.length > 0 && !finalText && !followUp;
    err.conversationId = result?.conversation_id || newConversation;
    err.denied = denied;
    throw err;
  };

  const retryWithoutTools = (err) => {
    onEvent({ type: 'activity', text: `♻️ ${err.denied.join(', ')} verweigert – neuer Anlauf über den Agent Store` });
    return attempt(err.conversationId, `Hinweis: ${err.denied.join(', ')} ist für dich in diesem Modus gesperrt – versuche es nicht erneut. `
      + 'Führe keine Terminal-Befehle aus und lege keine Dateien selbst an. Nutze für Recherche deine Such- und Lese-Werkzeuge oder dein Wissen '
      + 'und antworte jetzt direkt mit dem vollständigen Ergebnis. Soll eine Datei entstehen, gib sie als Block aus: '
      + 'erste Zeile ```datei:relativer/pfad.md, dann der Inhalt, dann ``` – der Agent Store speichert sie für dich. '
      + 'Kennzeichne, falls du etwas nicht prüfen konntest.');
  };

  try {
    return await attempt(agent.sessionId);
  } catch (err) {
    if (err.sessionMissing) {
      onEvent({ type: 'activity', text: '♻️ Alte Unterhaltung nicht gefunden – starte neu' });
      try {
        return await attempt(null);
      } catch (err2) {
        if (err2.deniedEmpty && err2.conversationId) return retryWithoutTools(err2);
        throw err2;
      }
    }
    if (err.deniedEmpty && err.conversationId) return retryWithoutTools(err);
    throw err;
  }
}
