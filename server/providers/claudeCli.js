// Claude über dein Claude-Abo: nutzt die Claude Code CLI im Print-Modus mit Live-Stream.
import { runLines, execQuick, AbortedError } from './proc.js';

const PERMISSION_MODES = {
  safe: null,                     // Standard: nur lesen, Änderungen werden verweigert
  edits: 'acceptEdits',           // darf Dateien im Arbeitsordner bearbeiten
  auto: 'auto',                   // Claude entscheidet selbst, was sicher ist
  full: 'bypassPermissions',      // alles erlaubt (auch Shell) – mit Vorsicht
};

export const info = {
  id: 'claude-cli',
  label: 'Claude (Abo via Claude Code)',
  short: 'Claude',
  modelSuggestions: ['sonnet', 'opus', 'haiku'],
  defaultModel: 'sonnet',
};

export async function detect() {
  const r = await execQuick('claude', ['--version']);
  if (!r.ok) return { available: false, hint: 'Claude Code nicht gefunden. Installieren: https://claude.com/claude-code – danach einmal "claude" starten und einloggen.' };
  return { available: true, version: r.stdout.trim().split('\n')[0] };
}

function describeTool(name, input) {
  const i = input || {};
  const detail = i.command || i.file_path || i.path || i.pattern || i.url || i.query || i.description || '';
  return `🔧 ${name}${detail ? ': ' + String(detail).slice(0, 80) : ''}`;
}

export async function run({ agent, prompt, persona, cwd, signal, onEvent, extraDirs = [] }) {
  const attempt = async (sessionId) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    for (const dir of extraDirs) args.push('--add-dir', dir);
    if (agent.model) args.push('--model', agent.model);
    if (sessionId) args.push('--resume', sessionId);
    const mode = PERMISSION_MODES[agent.autonomy];
    if (mode) args.push('--permission-mode', mode);
    if (persona) args.push('--append-system-prompt', persona);

    let text = '';
    let result = null;
    let newSession = null;
    const tools = new Map(); // block index -> { name, json }

    const { code, stderr } = await runLines({
      cmd: 'claude', args, cwd, input: prompt, signal,
      onLine: (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
          newSession = msg.session_id;
          onEvent({ type: 'session', id: msg.session_id });
          onEvent({ type: 'activity', text: '🚀 Session gestartet' });
        } else if (msg.type === 'stream_event') {
          const ev = msg.event || {};
          if (ev.type === 'content_block_start') {
            const block = ev.content_block || {};
            if (block.type === 'tool_use') {
              tools.set(ev.index, { name: block.name, json: '' });
              onEvent({ type: 'activity', text: `🔧 ${block.name}` });
            } else if (block.type === 'thinking') {
              onEvent({ type: 'activity', text: '🤔 denkt nach…' });
            } else if (block.type === 'text' && text && !msg.parent_tool_use_id) {
              text += '\n\n';
              onEvent({ type: 'delta', text: '\n\n' });
            }
          } else if (ev.type === 'content_block_delta') {
            const d = ev.delta || {};
            if (d.type === 'text_delta' && d.text && !msg.parent_tool_use_id) {
              if (!text) onEvent({ type: 'activity', text: '✍️ schreibt…' });
              text += d.text;
              onEvent({ type: 'delta', text: d.text });
            } else if (d.type === 'input_json_delta' && tools.has(ev.index)) {
              tools.get(ev.index).json += d.partial_json || '';
            }
          } else if (ev.type === 'content_block_stop' && tools.has(ev.index)) {
            const t = tools.get(ev.index);
            tools.delete(ev.index);
            let input = null;
            try { input = JSON.parse(t.json || '{}'); } catch { /* unvollständig */ }
            onEvent({ type: 'activity', text: describeTool(t.name, input), tool: true });
          }
        } else if (msg.type === 'user' && Array.isArray(msg.message?.content) && msg.message.content.some((c) => c.type === 'tool_result')) {
          onEvent({ type: 'activity', text: '📥 Werkzeug-Ergebnis erhalten' });
        } else if (msg.type === 'rate_limit_event' && msg.rate_limit_info) {
          onEvent({ type: 'limits', provider: 'claude-cli', info: msg.rate_limit_info });
        } else if (msg.type === 'result' || (msg.session_id && 'result' in msg && 'duration_ms' in msg)) {
          result = msg;
        }
      },
    });

    if (signal?.aborted) throw new AbortedError();
    if (result && !result.is_error) {
      return {
        text: text.trim() || String(result.result || '').trim(),
        sessionId: result.session_id || newSession,
        costUsd: result.total_cost_usd,
        usage: result.usage,
      };
    }
    const reason = (result && (result.result || result.subtype)) || stderr.trim() || `Claude CLI beendet mit Code ${code}`;
    const err = new Error(String(reason).slice(0, 2000));
    err.sessionMissing = /no conversation found/i.test(String(reason));
    throw err;
  };

  try {
    return await attempt(agent.sessionId);
  } catch (err) {
    // Session ist weg (z. B. Arbeitsordner gewechselt) → frisch starten.
    if (err.sessionMissing && agent.sessionId) {
      onEvent({ type: 'activity', text: '♻️ Alte Session nicht gefunden – starte neu' });
      return attempt(null);
    }
    throw err;
  }
}
