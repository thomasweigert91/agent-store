// Gemini über die Gemini API (API-Key aus Google AI Studio).
import { getApiKey } from '../store.js';
import { dialogHistory, readSse } from './shared.js';
import { AbortedError } from './proc.js';

export const info = {
  id: 'gemini-api',
  label: 'Gemini (API-Key)',
  short: 'Gemini API',
  modelSuggestions: ['gemini-pro-latest', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  defaultModel: 'gemini-pro-latest',
};

export async function detect() {
  return getApiKey('gemini')
    ? { available: true, version: 'API-Key hinterlegt' }
    : { available: false, hint: 'Kein Gemini API-Key hinterlegt (⚙️ Einstellungen).' };
}

export async function run({ agent, prompt, persona, history, signal, onEvent, settings }) {
  const key = getApiKey('gemini');
  if (!key) throw new Error('Kein Gemini API-Key hinterlegt. Trage ihn unter ⚙️ Einstellungen ein.');
  const model = agent.model || info.defaultModel;
  if (!/^[\w.\-]+$/.test(model)) throw new Error('Ungültiger Modellname: ' + model);

  const contents = dialogHistory(history, settings.historyTurnsForStateless).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));
  while (contents.length && contents[0].role !== 'user') contents.shift();
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  onEvent({ type: 'activity', text: '🚀 Anfrage an Gemini API…' });
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents,
        ...(persona ? { systemInstruction: { parts: [{ text: persona }] } } : {}),
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
    throw new Error(`Gemini API ${res.status}: ${msg}`.slice(0, 1500));
  }

  let text = '';
  let usage = {};
  try {
    await readSse(res, (ev) => {
      const parts = ev.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.thought) { onEvent({ type: 'activity', text: '🤔 denkt nach…' }); continue; }
        if (p.text) {
          if (!text) onEvent({ type: 'activity', text: '✍️ schreibt…' });
          text += p.text;
          onEvent({ type: 'delta', text: p.text });
        }
      }
      if (ev.usageMetadata) usage = ev.usageMetadata;
    });
  } catch (err) {
    if (signal?.aborted) throw new AbortedError();
    throw err;
  }
  if (!text.trim()) throw new Error('Gemini API hat keine Antwort geliefert (evtl. Sicherheitsfilter).');
  return { text: text.trim(), usage };
}
