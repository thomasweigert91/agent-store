// Quest-Board: Auftragsvorlagen mit Platzhaltern wie {{thema}}, Kategorien, optionaler Ausgabestruktur und Limits.
import crypto from 'node:crypto';
import { state, saveState } from './store.js';

const uid = () => crypto.randomBytes(5).toString('hex');

export const CATEGORIES = [
  { id: 'social', icon: '📱', title: 'Social Media' },
  { id: 'business', icon: '🚀', title: 'Gründung & Business' },
  { id: 'shop', icon: '🛍️', title: 'Shop & Produkte' },
  { id: 'comms', icon: '✉️', title: 'Kommunikation' },
  { id: 'research', icon: '🔬', title: 'Recherche & Analyse' },
  { id: 'dev', icon: '💻', title: 'Technik & Code' },
  { id: 'custom', icon: '📦', title: 'Eigene' },
];

// structure: feste Abschnitte der Antwort (je Abschnitt eigener Kopier-Knopf im Postfach)
// limits: { maxChars, maxHashtags, section } – Warnung im Postfach, wenn überschritten
export const BUILTIN_TEMPLATES = [
  // --- Social Media
  {
    id: 'b-ig-post', category: 'social', icon: '📸', title: 'Instagram-Post', archetype: 'marketer',
    prompt: 'Erstelle einen Instagram-Post zum Thema „{{thema}}“. Ziel: {{ziel}}. Mit starkem Einstiegssatz, Mehrwert und Call-to-Action.',
    structure: ['CAPTION', 'HASHTAGS', 'BILD-PROMPT'],
    limits: { maxChars: 2200, maxHashtags: 30, section: 'CAPTION' },
  },
  {
    id: 'b-ig-carousel', category: 'social', icon: '🎠', title: 'Karussell (Folien)', archetype: 'designer',
    prompt: 'Plane ein Instagram-/LinkedIn-Karussell mit {{folien}} Folien zum Thema „{{thema}}“. Folie 1 ist ein Hook, die letzte ein Call-to-Action. Pro Folie: Überschrift und 1–2 kurze Sätze.',
    structure: ['FOLIEN', 'CAPTION', 'HASHTAGS', 'BILD-PROMPT'],
    limits: { maxChars: 2200, maxHashtags: 30, section: 'CAPTION' },
  },
  {
    id: 'b-reel', category: 'social', icon: '🎬', title: 'Reel-/TikTok-Skript', archetype: 'marketer',
    prompt: 'Schreibe ein Kurzvideo-Skript (15–40 Sekunden) zum Thema „{{thema}}“. Hook in den ersten 2 Sekunden, Szenen mit Sprechtext und Bildidee, Schluss mit Call-to-Action.',
    structure: ['HOOK', 'SKRIPT', 'CAPTION', 'HASHTAGS'],
    limits: { maxChars: 2200, maxHashtags: 8, section: 'CAPTION' },
  },
  {
    id: 'b-pin', category: 'social', icon: '📌', title: 'Pinterest-Pin', archetype: 'marketer',
    prompt: 'Erstelle einen Pinterest-Pin für „{{thema}}“ (Link-Ziel: {{ziel}}). Suchmaschinen-optimierter Titel, Beschreibung mit Keywords, passender Board-Vorschlag und Bildidee.',
    structure: ['TITEL', 'BESCHREIBUNG', 'BOARD', 'BILD-PROMPT'],
    limits: { maxChars: 500, section: 'BESCHREIBUNG' },
  },
  {
    id: 'b-linkedin', category: 'social', icon: '💼', title: 'LinkedIn-Post', archetype: 'writer',
    prompt: 'Schreibe einen LinkedIn-Post zum Thema „{{thema}}“ aus der Perspektive von {{perspektive}}. Persönlich, mit einer Lernerfahrung und einer Frage am Ende.',
    structure: ['POST', 'HASHTAGS'],
    limits: { maxChars: 3000, maxHashtags: 5, section: 'POST' },
  },
  {
    id: 'b-social', category: 'social', icon: '📣', title: 'Social-Media-Paket', archetype: 'marketer',
    prompt: 'Erstelle ein Social-Media-Paket zu „{{thema}}“: 3 Instagram-Posts (mit Bildidee und Hashtags), 2 LinkedIn-Posts und 5 kurze Hooks für Reels. Zielgruppe: {{zielgruppe}}.',
  },
  // --- Gründung & Business
  {
    id: 'b-idea-check', category: 'business', icon: '💡', title: 'Geschäftsidee prüfen', archetype: 'critic',
    prompt: 'Prüfe diese Geschäftsidee kritisch: {{idee}}. Bewerte Problem, Zielgruppe, Zahlungsbereitschaft, Wettbewerb, Risiken und nenne die 3 wichtigsten Tests, mit denen ich sie günstig validieren kann.',
    structure: ['FAZIT', 'STÄRKEN', 'RISIKEN', 'NÄCHSTE SCHRITTE'],
  },
  {
    id: 'b-audience', category: 'business', icon: '🎯', title: 'Zielgruppe & Persona', archetype: 'analyst',
    prompt: 'Beschreibe die Zielgruppe für {{angebot}}: 2–3 Personas mit Alltag, Problemen, Wünschen, Kaufgründen, Einwänden und wo sie online unterwegs sind.',
    structure: ['PERSONAS', 'KAUFGRÜNDE', 'EINWÄNDE', 'KANÄLE'],
  },
  {
    id: 'b-pricing', category: 'business', icon: '💶', title: 'Preise festlegen', archetype: 'analyst',
    prompt: 'Entwickle eine Preisstrategie für {{angebot}}. Kosten pro Stück/Stunde ca.: {{kosten}}. Vergleiche mit dem Markt, schlage 3 Preisstufen vor und begründe sie.',
    structure: ['EMPFEHLUNG', 'PREISSTUFEN', 'BEGRÜNDUNG'],
  },
  {
    id: 'b-bizplan', category: 'business', icon: '📘', title: 'Businessplan-Gliederung', archetype: 'planner',
    prompt: 'Erstelle eine Businessplan-Gliederung für {{vorhaben}} mit Stichpunkten je Kapitel (Zusammenfassung, Angebot, Markt, Marketing, Organisation, Finanzen, Risiken). Rechtliche/steuerliche Punkte mit „mit Steuerberatung/IHK prüfen“ kennzeichnen.',
  },
  {
    id: 'b-name', category: 'business', icon: '🏷️', title: 'Name & Marke', archetype: 'designer',
    prompt: 'Entwickle 15 Namensideen für {{angebot}} (Stil: {{stil}}) mit kurzer Begründung, dazu 3 Slogan-Ideen und eine Beschreibung der Markenpersönlichkeit. Hinweis zur Markenrecherche (DPMA/EUIPO) ergänzen.',
    structure: ['NAMEN', 'SLOGANS', 'MARKENPERSÖNLICHKEIT'],
  },
  {
    id: 'b-plan', category: 'business', icon: '🗺️', title: 'Projektplan', archetype: 'planner',
    prompt: 'Erstelle einen umsetzbaren Plan für: {{vorhaben}}. Zeitrahmen: {{zeitrahmen}}. Mit Meilensteinen, Aufgaben pro Woche, Risiken und einer Checkliste für den Start.',
  },
  // --- Shop & Produkte
  {
    id: 'b-product', category: 'shop', icon: '🛍️', title: 'Produkttext', archetype: 'writer',
    prompt: 'Schreibe eine verkaufsstarke Produktbeschreibung für „{{produkt}}“. Zielgruppe: {{zielgruppe}}. Länge: {{länge}}. Mit Titel, 3 Nutzen-Bulletpoints und einem kurzen Absatz.',
    structure: ['TITEL', 'BULLETPOINTS', 'BESCHREIBUNG'],
  },
  {
    id: 'b-listing', category: 'shop', icon: '🧾', title: 'Shop-Listing mit Tags', archetype: 'marketer',
    prompt: 'Erstelle ein Marktplatz-Listing (z. B. Etsy) für „{{produkt}}“: suchoptimierter Titel, genau 13 Tags (je max. 20 Zeichen), Beschreibung mit Nutzen, Material und Pflegehinweisen sowie 3 Bildideen.',
    structure: ['TITEL', 'TAGS', 'BESCHREIBUNG', 'BILDIDEEN'],
    limits: { maxChars: 140, section: 'TITEL' },
  },
  // --- Kommunikation
  {
    id: 'b-mail', category: 'comms', icon: '📧', title: 'E-Mail-Antwort', archetype: 'writer',
    prompt: 'Formuliere eine Antwort auf folgende E-Mail. Ziel der Antwort: {{ziel}}. Ton: {{ton}}.\n\nE-Mail:\n{{email}}',
    structure: ['BETREFF', 'TEXT'],
  },
  {
    id: 'b-offer', category: 'comms', icon: '📄', title: 'Angebot schreiben', archetype: 'writer',
    prompt: 'Schreibe ein Angebot an {{kunde}} für {{leistung}}. Umfang/Preis: {{preis}}. Mit kurzer Einleitung, Leistungsbeschreibung, Ablauf, Konditionen und freundlichem Abschluss.',
    structure: ['BETREFF', 'ANGEBOT'],
  },
  {
    id: 'b-newsletter', category: 'comms', icon: '📰', title: 'Newsletter', archetype: 'writer',
    prompt: 'Schreibe einen Newsletter zum Thema „{{thema}}“ für {{zielgruppe}}. Mit Betreffzeile (plus 2 Alternativen), Vorschautext, kurzem Hauptteil und einem klaren Call-to-Action.',
    structure: ['BETREFF', 'VORSCHAUTEXT', 'TEXT'],
    limits: { maxChars: 60, section: 'BETREFF' },
  },
  {
    id: 'b-blog', category: 'comms', icon: '✍️', title: 'Blogpost', archetype: 'writer',
    prompt: 'Schreibe einen Blogpost zum Thema „{{thema}}“ für {{zielgruppe}}. Ton: {{ton}}. Länge ca. {{wörter}} Wörter, mit Überschrift, Zwischenüberschriften und einem Call-to-Action am Ende.',
  },
  {
    id: 'b-translate', category: 'comms', icon: '🌍', title: 'Übersetzung', archetype: 'translator',
    prompt: 'Übersetze den folgenden Text nach {{zielsprache}}. Behalte Ton und Formatierung bei.\n\n{{text}}',
  },
  // --- Recherche & Analyse
  {
    id: 'b-competition', category: 'research', icon: '📊', title: 'Wettbewerbsanalyse', archetype: 'analyst',
    prompt: 'Analysiere den Wettbewerb für {{angebot}} im Markt {{markt}}. Vergleiche 4–6 Wettbewerber in einer Tabelle (Angebot, Preis, Stärken, Schwächen) und leite 5 konkrete Chancen für mich ab.',
    structure: ['ÜBERSICHT', 'CHANCEN'],
  },
  {
    id: 'b-trends', category: 'research', icon: '📈', title: 'Trends recherchieren', archetype: 'researcher',
    prompt: 'Recherchiere aktuelle Trends zu „{{thema}}“ (Fokus: {{fokus}}). Liefere 7 konkrete Trends mit kurzer Begründung, Quelle und einer Idee, wie ich sie nutzen kann.',
    structure: ['TRENDS', 'IDEEN'],
  },
  {
    id: 'b-research', category: 'research', icon: '🔬', title: 'Wochenrecherche', archetype: 'researcher',
    prompt: 'Recherchiere die wichtigsten Entwicklungen der letzten 7 Tage zum Thema „{{thema}}“. Fokus: {{fokus}}. Liefere 5–8 Punkte mit je 2 Sätzen, Quellen, und am Ende eine TL;DR.',
  },
  {
    id: 'b-summary', category: 'research', icon: '🗜️', title: 'Zusammenfassung', archetype: 'scout',
    prompt: 'Fasse den folgenden Inhalt für {{zweck}} zusammen: Kernaussagen, wichtige Zahlen, offene Fragen.\n\n{{inhalt}}',
    structure: ['KERNAUSSAGEN', 'DETAILS', 'OFFENE FRAGEN'],
  },
  {
    id: 'b-ideas', category: 'research', icon: '🧠', title: 'Ideen-Brainstorming', archetype: 'designer',
    prompt: 'Brainstorme 15 originelle Ideen für {{ziel}}. Rahmenbedingungen: {{rahmen}}. Gruppiere sie nach Aufwand (klein/mittel/groß) und markiere deine 3 Favoriten mit Begründung.',
  },
  // --- Technik & Code
  {
    id: 'b-review', category: 'dev', icon: '🧐', title: 'Code-Review', archetype: 'critic',
    prompt: 'Führe ein gründliches Code-Review durch für: {{datei_oder_ordner}}. Achte besonders auf: {{schwerpunkt}}. Liste Probleme nach Schweregrad (kritisch/mittel/gering) mit konkreten Verbesserungsvorschlägen.',
  },
];

const clean = (s) => String(s || '').trim();

function normStructure(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[\n,;]/);
  return [...new Set(arr.map((x) => clean(x).toUpperCase().replace(/[:*#]/g, '').slice(0, 30)).filter(Boolean))].slice(0, 8);
}

function normLimits(v) {
  if (!v || typeof v !== 'object') return null;
  const maxChars = Number(v.maxChars) > 0 ? Math.round(Number(v.maxChars)) : null;
  const maxHashtags = Number(v.maxHashtags) > 0 ? Math.round(Number(v.maxHashtags)) : null;
  if (!maxChars && !maxHashtags) return null;
  return { maxChars, maxHashtags, section: v.section ? clean(v.section).toUpperCase().slice(0, 30) : null };
}

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
    .map((t) => ({ ...t, category: t.category || 'custom', structure: t.structure || [], limits: t.limits || null, fields: fieldsOf(t.prompt) }));
}

export function findTemplate(id) {
  return listTemplates().find((t) => t.id === id) || null;
}

function validate(body) {
  const title = clean(body.title).slice(0, 60);
  const prompt = clean(body.prompt).slice(0, 20000);
  if (!title || !prompt) throw Object.assign(new Error('Titel und Auftragstext sind Pflicht.'), { status: 400 });
  return {
    title,
    prompt,
    icon: String(body.icon || '📜').slice(0, 8),
    archetype: String(body.archetype || ''),
    category: CATEGORIES.some((c) => c.id === body.category) ? body.category : 'custom',
    structure: normStructure(body.structure),
    limits: normLimits(body.limits),
  };
}

export function createTemplate(body) {
  const t = { id: uid(), createdAt: Date.now(), ...validate(body) };
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

// Eigene Vorlagen als Paket exportieren (optional nur eine Kategorie).
export function exportTemplates(category) {
  const items = state.templates.filter((t) => !category || (t.category || 'custom') === category);
  return {
    format: 'agent-store-templates',
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: items.map(({ title, prompt, icon, archetype, category: c, structure, limits }) => ({ title, prompt, icon, archetype, category: c, structure, limits })),
  };
}

// Paket importieren: jede Vorlage bekommt eine neue ID, gleiche Titel+Text werden übersprungen.
export function importTemplates(pkg) {
  const items = Array.isArray(pkg) ? pkg : pkg?.templates;
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Keine Vorlagen in der Datei gefunden.'), { status: 400 });
  let added = 0;
  let skipped = 0;
  for (const raw of items.slice(0, 200)) {
    try {
      const t = validate(raw);
      if (state.templates.some((x) => x.title === t.title && x.prompt === t.prompt)) { skipped++; continue; }
      state.templates.push({ id: uid(), createdAt: Date.now(), ...t });
      added++;
    } catch { skipped++; }
  }
  saveState();
  return { added, skipped };
}

// Anweisung für eine feste Ausgabestruktur (wird an den Auftrag angehängt).
export function structureInstruction(structure) {
  if (!structure?.length) return '';
  return `\n\nGliedere deine Antwort GENAU in diese Abschnitte. Beginne jeden Abschnitt mit einer eigenen Zeile „NAME:“ `
    + `(ohne Markdown davor) und schreibe den Inhalt darunter: ${structure.map((s) => `${s}:`).join(' ')}`;
}

export function fillTemplate(template, values = {}) {
  return template.prompt.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const v = String(values[key.trim()] ?? '').trim();
    return v || '(beliebig)';
  }) + structureInstruction(template.structure);
}

// Auftrag zum Umwandeln eines vorhandenen Ergebnisses in das Format einer Vorlage.
export function conversionPrompt(template, sourceText, note = '') {
  const spec = template.prompt.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => `[${key.trim()}: aus dem Ausgangsmaterial ableiten]`);
  return `Wandle das Ausgangsmaterial unten in dieses Format um: ${template.title}.\n`
    + `Formatvorgabe: ${spec}\n${note ? `Zusätzlicher Hinweis: ${note}\n` : ''}`
    + `\nAusgangsmaterial:\n"""\n${String(sourceText).slice(0, 60000)}\n"""`
    + structureInstruction(template.structure);
}
