// Demo-Provider: simuliert einen arbeitenden Agent – kostenlos, ideal zum Ausprobieren.
import { AbortedError } from './proc.js';

export const info = {
  id: 'demo',
  label: 'Demo (simuliert, kostenlos)',
  short: 'Demo',
  modelSuggestions: ['demo'],
  defaultModel: '',
};

export async function detect() {
  return { available: true, version: 'immer verfügbar' };
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new AbortedError()); }, { once: true });
});

export async function run({ agent, prompt, signal, onEvent }) {
  const steps = ['📚 liest den Auftrag…', '🔎 sammelt Ideen…', '🧠 sortiert Gedanken…'];
  for (const s of steps) {
    onEvent({ type: 'activity', text: s });
    await sleep(500 + Math.random() * 900, signal);
  }
  const task = prompt.replace(/^\[Projekt[\s\S]*?\n\n/, '');
  const topic = task.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (/NOTE: <0-10>\/10/.test(prompt)) {
    // Prüfer-Modus: erste Fassung durchwachsen, Überarbeitungen besser.
    const revised = /Runde [2-5]/.test(prompt);
    const score = revised ? 8 + Math.round(Math.random()) : 5 + Math.round(Math.random());
    const text = revised
      ? `## Prüfung\n\nDie Überarbeitung hat die Punkte gut umgesetzt. Struktur und Ton passen jetzt.\n\nNOTE: ${score}/10\nENTSCHEIDUNG: OK`
      : `## Prüfung\n\n1. Die Einleitung ist zu lang.\n2. Es fehlen konkrete Beispiele.\n3. Der Schluss braucht einen klaren Call-to-Action.\n\nNOTE: ${score}/10\nENTSCHEIDUNG: ÜBERARBEITEN`;
    onEvent({ type: 'activity', text: '✍️ schreibt…' });
    for (const word of text.split(/(\s+)/)) {
      onEvent({ type: 'delta', text: word });
      await sleep(10 + Math.random() * 25, signal);
    }
    return { text };
  }
  const answer = [
    `## Ergebnis von ${agent.name}`,
    '',
    `Du hast mich beauftragt mit: *„${topic}${task.length > 80 ? '…' : ''}“*`,
    '',
    'Das ist eine **simulierte Antwort** des Demo-Modus. So würde ich vorgehen:',
    '',
    '1. Ziel und Rahmenbedingungen klären',
    '2. Relevante Informationen sammeln',
    '3. Lösung entwerfen und prüfen',
    '4. Ergebnis kompakt zusammenfassen',
    '',
    '```text',
    'Tipp: Wechsle in den Agent-Einstellungen auf "Claude" oder "Gemini",',
    'damit echte KI-Modelle für dich arbeiten.',
    '```',
  ].join('\n');

  onEvent({ type: 'activity', text: '✍️ schreibt…' });
  let text = '';
  for (const word of answer.split(/(\s+)/)) {
    text += word;
    onEvent({ type: 'delta', text: word });
    await sleep(15 + Math.random() * 40, signal);
  }
  return { text };
}
