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
  const task = prompt.replace(/^\[Projekt[\s\S]*?\n\n/, '').replace(/^\[Kontext-Profil[\s\S]*?\n\n/, '');
  const topic = task.replace(/\s+/g, ' ').trim().slice(0, 80);
  const structured = prompt.match(/Gliedere deine Antwort GENAU in diese Abschnitte[\s\S]*?darunter:\s*(.+)$/m);
  if (structured && !/NOTE: <0-10>\/10/.test(prompt)) {
    // Vorlagen mit Ausgabestruktur: zu jedem Abschnitt passenden Demo-Inhalt liefern.
    const names = [...structured[1].matchAll(/([A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 \-]*?):/g)].map((m) => m[1].trim());
    const theme = task.split('\n')[0].replace(/^Wandle das Ausgangsmaterial.*?Format um:\s*/, '').slice(0, 70);
    const sample = (name) => {
      if (/HASHTAG/.test(name)) return '#demo #agentstore #ideen #kreativ #selbststaendig';
      if (/^TAGS$/.test(name)) return Array.from({ length: 13 }, (_, i) => `tag${i + 1}`).join(', ');
      if (/BILD/.test(name)) return 'Helles Flatlay auf Holztisch, natürliches Licht, warme Farben, viel Weißraum für Text.';
      if (/FOLIEN|SKRIPT|PERSONAS|TRENDS|NAMEN/.test(name)) return '1. Erster Punkt\n2. Zweiter Punkt\n3. Dritter Punkt';
      if (/BETREFF|TITEL|HOOK/.test(name)) return `Demo: ${theme.slice(0, 50)}`;
      return `Simulierter Inhalt für „${name}“ zu: ${theme}. Wechsle auf Claude oder Gemini für echte Texte.`;
    };
    const text = names.map((n) => `${n}:\n${sample(n)}`).join('\n\n');
    onEvent({ type: 'activity', text: '✍️ schreibt…' });
    for (const word of text.split(/(\s+)/)) {
      onEvent({ type: 'delta', text: word });
      await sleep(5 + Math.random() * 15, signal);
    }
    return { text };
  }
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
