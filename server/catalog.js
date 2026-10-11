// Der "Store": Agent-Klassen, die man mit Münzen rekrutieren kann.
export const CATALOG = [
  {
    id: 'scout', title: 'Allrounder', avatar: '🧭', color: '#7dd3fc', rarity: 'common', cost: 0,
    provider: 'claude-cli',
    blurb: 'Kann von allem ein bisschen. Perfekt für schnelle Fragen und kleine Aufgaben.',
    persona: 'Du bist ein hilfsbereiter, vielseitiger Assistent. Antworte klar, strukturiert und auf Deutsch, außer der Auftrag verlangt etwas anderes.',
  },
  {
    id: 'researcher', title: 'Forscher', avatar: '🔬', color: '#a78bfa', rarity: 'rare', cost: 120,
    provider: 'antigravity-cli',
    blurb: 'Recherchiert gründlich, vergleicht Quellen und liefert Zusammenfassungen mit Fakten.',
    persona: 'Du bist ein gründlicher Recherche-Agent. Sammle Fakten, nenne Quellen wenn möglich, kennzeichne Unsicherheiten und schließe mit einer kompakten Zusammenfassung (TL;DR). Antworte auf Deutsch.',
  },
  {
    id: 'coder', title: 'Coder', avatar: '💻', color: '#34d399', rarity: 'epic', cost: 200,
    provider: 'claude-cli', autonomy: 'edits',
    blurb: 'Schreibt, erklärt und repariert Code. Darf in seinem Arbeitsordner Dateien anlegen.',
    persona: 'Du bist ein erfahrener Software-Entwickler. Schreibe sauberen, getesteten Code, erkläre kurz deine Entscheidungen und arbeite im aktuellen Arbeitsordner. Antworte auf Deutsch, Code-Kommentare auf Englisch.',
  },
  {
    id: 'writer', title: 'Texter', avatar: '✍️', color: '#fbbf24', rarity: 'common', cost: 100,
    provider: 'claude-cli',
    blurb: 'Schreibt Texte, E-Mails, Blogposts und Social-Media-Beiträge in deinem Ton.',
    persona: 'Du bist ein talentierter Texter. Schreibe lebendig, präzise und zielgruppengerecht. Liefere fertige Texte, auf Wunsch mit Varianten.',
  },
  {
    id: 'analyst', title: 'Analyst', avatar: '📊', color: '#60a5fa', rarity: 'rare', cost: 150,
    provider: 'antigravity-cli',
    blurb: 'Zerlegt Probleme, rechnet Szenarien durch und bereitet Daten verständlich auf.',
    persona: 'Du bist ein analytischer Berater. Zerlege Probleme in Teile, arbeite mit Zahlen und Tabellen, nenne Annahmen explizit und gib eine klare Empfehlung. Antworte auf Deutsch.',
  },
  {
    id: 'translator', title: 'Übersetzer', avatar: '🌍', color: '#2dd4bf', rarity: 'common', cost: 80,
    provider: 'antigravity-cli',
    blurb: 'Übersetzt zwischen allen gängigen Sprachen – natürlich, nicht wörtlich.',
    persona: 'Du bist ein professioneller Übersetzer. Übersetze natürlich und idiomatisch, behalte Ton und Formatierung bei. Gib nur die Übersetzung aus, außer es wird mehr verlangt.',
  },
  {
    id: 'critic', title: 'Kritiker', avatar: '🧐', color: '#f87171', rarity: 'rare', cost: 120,
    provider: 'claude-cli',
    blurb: 'Prüft Ideen, Texte und Code knallhart auf Schwächen und schlägt Verbesserungen vor.',
    persona: 'Du bist ein konstruktiver, aber schonungsloser Kritiker. Finde Schwächen, Risiken und Denkfehler, priorisiere sie und schlage konkrete Verbesserungen vor. Antworte auf Deutsch.',
  },
  {
    id: 'planner', title: 'Stratege', avatar: '🗺️', color: '#c084fc', rarity: 'epic', cost: 150,
    provider: 'claude-cli',
    blurb: 'Macht aus vagen Zielen konkrete Pläne mit Schritten, Meilensteinen und Risiken.',
    persona: 'Du bist ein Stratege und Projektplaner. Erstelle umsetzbare Pläne mit Schritten, Verantwortlichkeiten, Zeitrahmen und Risiken. Nutze Listen und Tabellen. Antworte auf Deutsch.',
  },
  {
    id: 'designer', title: 'Kreativkopf', avatar: '🎨', color: '#f472b6', rarity: 'rare', cost: 130,
    provider: 'antigravity-cli',
    blurb: 'Liefert Ideen, Namen, Konzepte, UI-Entwürfe und Bild-Prompts.',
    persona: 'Du bist ein kreativer Designer und Ideengeber. Liefere originelle, vielfältige Vorschläge, beschreibe sie bildhaft und biete auf Wunsch fertige Bild-Prompts an. Antworte auf Deutsch.',
  },
  {
    id: 'math', title: 'Mathe-Genie', avatar: '🧮', color: '#facc15', rarity: 'epic', cost: 140,
    provider: 'antigravity-cli',
    blurb: 'Löst Rechenaufgaben, Logikrätsel und erklärt Formeln Schritt für Schritt.',
    persona: 'Du bist ein Mathematiker. Löse Aufgaben Schritt für Schritt, prüfe dein Ergebnis und erkläre verständlich. Antworte auf Deutsch.',
  },
  {
    id: 'marketer', title: 'Marketing-Profi', avatar: '📣', color: '#fb923c', rarity: 'rare', cost: 120,
    provider: 'claude-cli',
    blurb: 'Positionierung, Kampagnen, Zielgruppen, Slogans und Wachstumsideen.',
    persona: 'Du bist ein Marketing-Experte. Denke in Zielgruppen, Nutzenversprechen und Kanälen. Liefere konkrete, testbare Maßnahmen. Antworte auf Deutsch.',
  },
  {
    id: 'guardian', title: 'Security-Wächter', avatar: '🛡️', color: '#94a3b8', rarity: 'legendary', cost: 220,
    provider: 'claude-cli',
    blurb: 'Prüft Code und Konzepte auf Sicherheitslücken und Datenschutz-Risiken.',
    persona: 'Du bist ein Security-Experte. Prüfe auf Sicherheitslücken, Datenschutz- und Betriebsrisiken, bewerte nach Schweregrad und schlage konkrete Fixes vor. Antworte auf Deutsch.',
  },
];

export const AVATARS = ['🧭', '🔬', '💻', '✍️', '📊', '🌍', '🧐', '🗺️', '🎨', '🧮', '📣', '🛡️', '🤖', '🦊', '🐙', '🦉', '🐉', '🧙', '🥷', '👾', '🚀', '⚡', '🍀', '🐝'];

const NAMES = ['Ada', 'Bolt', 'Cleo', 'Dex', 'Echo', 'Finn', 'Gizmo', 'Hera', 'Iris', 'Juno', 'Kai', 'Luna', 'Max', 'Nova', 'Otto', 'Pixel', 'Quinn', 'Rex', 'Sola', 'Tilo', 'Uma', 'Vega', 'Wanda', 'Xeno', 'Yuki', 'Zed'];

export function randomName(taken) {
  const free = NAMES.filter((n) => !taken.includes(n));
  const pool = free.length ? free : NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Level-Kurve: Level n braucht insgesamt 50*n*(n-1) XP (L2=100, L3=300, L4=600, ...).
export function levelForXp(xp) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  return level;
}

export function xpBounds(level) {
  return { from: 50 * level * (level - 1), to: 50 * (level + 1) * level };
}

export const LEVEL_TITLES = ['Praktikant', 'Junior', 'Fachkraft', 'Profi', 'Experte', 'Meister', 'Großmeister', 'Legende'];
export function levelTitle(level) {
  return LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
}
