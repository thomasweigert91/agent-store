// Quest-Board: Auftragsvorlagen mit Platzhaltern wie {{thema}}.
import crypto from 'node:crypto';
import { state, saveState } from './store.js';

const uid = () => crypto.randomBytes(5).toString('hex');

export const BUILTIN_TEMPLATES = [
  {
    id: 'b-research', icon: '🔬', title: 'Wochenrecherche', archetype: 'researcher',
    prompt: 'Recherchiere die wichtigsten Entwicklungen der letzten 7 Tage zum Thema „{{thema}}“. Fokus: {{fokus}}. Liefere 5–8 Punkte mit je 2 Sätzen, Quellen, und am Ende eine TL;DR.',
  },
  {
    id: 'b-product', icon: '🛍️', title: 'Produkttext', archetype: 'writer',
    prompt: 'Schreibe eine verkaufsstarke Produktbeschreibung für „{{produkt}}“. Zielgruppe: {{zielgruppe}}. Länge: {{länge}}. Mit Titel, 3 Nutzen-Bulletpoints und einem kurzen Absatz. Zusätzlich 10 passende Suchbegriffe/Tags.',
  },
  {
    id: 'b-review', icon: '🧐', title: 'Code-Review', archetype: 'critic',
    prompt: 'Führe ein gründliches Code-Review durch für: {{datei_oder_ordner}}. Achte besonders auf: {{schwerpunkt}}. Liste Probleme nach Schweregrad (kritisch/mittel/gering) mit konkreten Verbesserungsvorschlägen.',
  },
  {
    id: 'b-blog', icon: '✍️', title: 'Blogpost', archetype: 'writer',
    prompt: 'Schreibe einen Blogpost zum Thema „{{thema}}“ für {{zielgruppe}}. Ton: {{ton}}. Länge ca. {{wörter}} Wörter, mit Überschrift, Zwischenüberschriften und einem Call-to-Action am Ende.',
  },
  {
    id: 'b-mail', icon: '📧', title: 'E-Mail-Antwort', archetype: 'writer',
    prompt: 'Formuliere eine Antwort auf folgende E-Mail. Ziel der Antwort: {{ziel}}. Ton: {{ton}}.\n\nE-Mail:\n{{email}}',
  },
  {
    id: 'b-social', icon: '📣', title: 'Social-Media-Paket', archetype: 'marketer',
    prompt: 'Erstelle ein Social-Media-Paket zu „{{thema}}“: 3 Instagram-Posts (mit Bildidee und Hashtags), 2 LinkedIn-Posts und 5 kurze Hooks für Reels. Zielgruppe: {{zielgruppe}}.',
  },
  {
    id: 'b-translate', icon: '🌍', title: 'Übersetzung', archetype: 'translator',
    prompt: 'Übersetze den folgenden Text nach {{zielsprache}}. Behalte Ton und Formatierung bei.\n\n{{text}}',
  },
  {
    id: 'b-ideas', icon: '💡', title: 'Ideen-Brainstorming', archetype: 'designer',
    prompt: 'Brainstorme 15 originelle Ideen für {{ziel}}. Rahmenbedingungen: {{rahmen}}. Gruppiere sie nach Aufwand (klein/mittel/groß) und markiere deine 3 Favoriten mit Begründung.',
  },
  {
    id: 'b-competition', icon: '📊', title: 'Wettbewerbsanalyse', archetype: 'analyst',
    prompt: 'Analysiere den Wettbewerb für {{angebot}} im Markt {{markt}}. Vergleiche 4–6 Wettbewerber in einer Tabelle (Angebot, Preis, Stärken, Schwächen) und leite 5 konkrete Chancen für mich ab.',
  },
  {
    id: 'b-plan', icon: '🗺️', title: 'Projektplan', archetype: 'planner',
    prompt: 'Erstelle einen umsetzbaren Plan für: {{vorhaben}}. Zeitrahmen: {{zeitrahmen}}. Mit Meilensteinen, Aufgaben pro Woche, Risiken und einer Checkliste für den Start.',
  },
];

// Platzhalter {{name}} aus dem Text lesen (Reihenfolge des ersten Auftretens).
export function fieldsOf(prompt) {
  const seen = new Set();
  const out = [];
  for (const m of String(prompt).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const key = m[1].trim();
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

export function listTemplates() {
  return [...BUILTIN_TEMPLATES.map((t) => ({ ...t, builtin: true })), ...state.templates]
    .map((t) => ({ ...t, fields: fieldsOf(t.prompt) }));
}

export function findTemplate(id) {
  return listTemplates().find((t) => t.id === id) || null;
}

export function createTemplate(body) {
  const title = String(body.title || '').trim().slice(0, 60);
  const prompt = String(body.prompt || '').trim().slice(0, 20000);
  if (!title || !prompt) throw Object.assign(new Error('Titel und Auftragstext sind Pflicht.'), { status: 400 });
  const t = {
    id: uid(),
    title,
    prompt,
    icon: String(body.icon || '📜').slice(0, 8),
    archetype: String(body.archetype || ''),
    createdAt: Date.now(),
  };
  state.templates.push(t);
  saveState();
  return t;
}

export function deleteTemplate(id) {
  const before = state.templates.length;
  state.templates = state.templates.filter((t) => t.id !== id);
  if (state.templates.length === before) throw Object.assign(new Error('Nur eigene Vorlagen können gelöscht werden.'), { status: 400 });
  saveState();
}

export function fillTemplate(template, values = {}) {
  return template.prompt.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const v = String(values[key.trim()] ?? '').trim();
    return v || '(beliebig)';
  });
}
