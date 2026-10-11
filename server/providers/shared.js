// Gemeinsame Helfer für Provider ohne eigenes Session-Gedächtnis.

// Nur echte Dialog-Nachrichten (keine Fehler/Systemhinweise), letzte `maxTurns` Paare.
export function dialogHistory(messages, maxTurns = 12) {
  const dialog = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  return dialog.slice(-maxTurns * 2);
}

// Baut einen Prompt mit Rolle + bisherigem Verlauf, für CLIs die keine Session fortsetzen.
export function buildTranscriptPrompt({ persona, history, prompt, maxChars = 24000 }) {
  const parts = [];
  if (persona) parts.push(`# Deine Rolle\n${persona}`);
  if (history.length) {
    let transcript = history
      .map((m) => `${m.role === 'user' ? 'NUTZER' : 'DU'}: ${m.text}`)
      .join('\n\n');
    if (transcript.length > maxChars) transcript = '…' + transcript.slice(-maxChars);
    parts.push(`# Bisheriger Verlauf\n${transcript}`);
  }
  parts.push(`# Neuer Auftrag\n${prompt}`);
  return parts.join('\n\n');
}

// Liest einen SSE-Stream (fetch Response) und ruft onData mit jedem geparsten JSON-Objekt auf.
export async function readSse(response, onData) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of response.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      try { onData(JSON.parse(data)); } catch { /* ignorieren */ }
    }
  }
}
