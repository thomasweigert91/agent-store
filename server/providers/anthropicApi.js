// Claude über die Anthropic API (API-Key, Abrechnung pro Token).
import { getApiKey } from '../store.js';
import { dialogHistory, readSse } from './shared.js';
import { AbortedError } from './proc.js';

export const info = {
  id: 'claude-api',
  label: 'Claude (API-Key)',
  short: 'Claude API',
  modelSuggestions: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  defaultModel: 'claude-sonnet-5-5',
};

export async function detect() {
  return getApiKey('anthropic')
    ? { available: true, version: 'API-Key hinterlegt' }
    : { available: false, hint: 'Kein Anthropic API-Key hinterlegt (⚙️ Einstellungen).' };
}

export async function run({ agent, prompt, persona, history, signal, onEvent, settings }) {
  const key = getApiKey('anthropic');
  if (!key) throw new Error('Kein Anthropic API-Key hinterlegt. Trage ihn unter ⚙️ Einstellungen ein.');

  const messages = dialogHistory(history, settings.historyTurnsForStateless).map((m) => ({ role: m.role, content: m.text }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'user', content: prompt });

  onEvent({ type: 'activity', text: '🚀 Anfrage an Anthropic API…' });
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: agent.model || info.defaultModel,
        max_tokens: 16000,
        system: persona || undefined,
        messages,
        stream: true,
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw new AbortedError();
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = body;
    try { msg = JSON.parse(body).error?.message || body; } catch { /* roh */ }
    throw new Error(`Anthropic API ${res.status}: ${msg}`.slice(0, 1500));
  }

  let text = '';
  let usage = {};
  try {
    await readSse(res, (ev) => {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        if (!text) onEvent({ type: 'activity', text: '✍️ schreibt…' });
        text += ev.delta.text;
        onEvent({ type: 'delta', text: ev.delta.text });
      } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'thinking') {
        onEvent({ type: 'activity', text: '🤔 denkt nach…' });
      } else if (ev.type === 'message_delta' && ev.usage) {
        usage = { ...usage, ...ev.usage };
      } else if (ev.type === 'message_start' && ev.message?.usage) {
        usage = { ...ev.message.usage };
      } else if (ev.type === 'error') {
        throw new Error('Anthropic API: ' + (ev.error?.message || 'Stream-Fehler'));
      }
    });
  } catch (err) {
    if (signal?.aborted) throw new AbortedError();
    throw err;
  }
  return { text: text.trim(), usage };
}
