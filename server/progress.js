// Team-Progression: Büro-Upgrades, Erfolge, Talente pro Level und Statistiken.
import { state, saveState } from './store.js';
import { emit } from './events.js';
import { levelForXp } from './catalog.js';
import * as archive from './archive.js';

// Büro-Upgrades gelten fürs ganze Hauptquartier. Jedes hebt die Team-Moral (+3 % Münzen).
export const UPGRADES = [
  { id: 'plants', icon: '🪴', title: 'Pflanzen-Paket', cost: 60, desc: 'Hängepflanze und Kaktus – mehr Grün im Büro.' },
  { id: 'rug', icon: '🟥', title: 'Teppich', cost: 70, desc: 'Ein gemütlicher Teppich unter jedem Schreibtisch.' },
  { id: 'poster', icon: '🖼️', title: 'Poster', cost: 80, desc: 'Motivationsposter an der Wand.' },
  { id: 'lights', icon: '✨', title: 'Lichterkette', cost: 90, desc: 'Blinkende Lichterkette unter der Decke.' },
  { id: 'lamp', icon: '💡', title: 'Schreibtischlampe', cost: 100, desc: 'Warmes Licht – besonders nachts schön.' },
  { id: 'shelf', icon: '📚', title: 'Bücherregal', cost: 110, desc: 'Regal mit Fachbüchern über dem Monitor.' },
  { id: 'coffee', icon: '☕', title: 'Kaffeemaschine', cost: 120, desc: 'Eigene Kaffeemaschine – es wird öfter Kaffee getrunken.' },
  { id: 'bigmonitor', icon: '🖥️', title: 'Großer Monitor', cost: 150, desc: 'Breitere Bildschirme für alle.' },
  { id: 'cat', icon: '🐈', title: 'Bürokatze', cost: 250, desc: 'Eine Katze schläft unter dem Schreibtisch.' },
];

export const MORALE_PER_UPGRADE = 0.03;

export function moraleFactor() {
  return 1 + MORALE_PER_UPGRADE * state.upgrades.length;
}

// Talente schalten sich mit dem Level frei und ergänzen den System-Prompt.
export const TALENTS = [
  { id: 'sources', level: 3, icon: '📎', title: 'Quellenkunde', desc: 'Nennt Quellen und kennzeichnet Unsicherheiten.', instruction: 'Nenne zu Fakten nach Möglichkeit Quellen und kennzeichne Unsicherheiten ausdrücklich.' },
  { id: 'selfcheck', level: 5, icon: '🔍', title: 'Selbstkontrolle', desc: 'Prüft die Antwort vor der Abgabe auf Fehler und Lücken.', instruction: 'Prüfe deine Antwort vor der Abgabe kritisch auf Fehler, Lücken und Widersprüche und korrigiere sie, bevor du antwortest.' },
  { id: 'tldr', level: 7, icon: '🎯', title: 'Auf den Punkt', desc: 'Beginnt mit einer TL;DR-Zusammenfassung.', instruction: 'Beginne jede Antwort mit einer TL;DR-Zusammenfassung in 1–3 Sätzen.' },
  { id: 'mentor', level: 8, icon: '🧭', title: 'Mentor', desc: 'Schlägt am Ende sinnvolle nächste Schritte vor.', instruction: 'Schließe mit 1–3 konkreten Vorschlägen für sinnvolle nächste Schritte.' },
];

export function activeTalents(agent) {
  const level = levelForXp(agent.xp);
  const off = new Set(agent.talentsOff || []);
  return TALENTS.filter((t) => level >= t.level && !off.has(t.id));
}

export function personaWithTalents(agent) {
  const talents = activeTalents(agent);
  if (!talents.length) return agent.persona;
  return `${agent.persona || ''}\n\nFähigkeiten (durch Erfahrung freigeschaltet):\n${talents.map((t) => `- ${t.instruction}`).join('\n')}`.trim();
}

// Erfolge: Fortschritt kommt aus state.stats (Zähler) bzw. berechneten Werten.
export const ACHIEVEMENTS = [
  { id: 'first_quest', icon: '🎉', title: 'Erster Auftrag', desc: 'Ein Agent hat seinen ersten Auftrag erledigt.', stat: 'quests', goal: 1, reward: 20 },
  { id: 'quests_25', icon: '🐝', title: 'Fleißiges Team', desc: '25 Aufträge erledigt.', stat: 'quests', goal: 25, reward: 75 },
  { id: 'quests_100', icon: '🏭', title: 'Auftragsmaschine', desc: '100 Aufträge erledigt.', stat: 'quests', goal: 100, reward: 200 },
  { id: 'full_house', icon: '🏢', title: 'Volles Haus', desc: '10 Agents gleichzeitig im Team.', stat: 'maxAgents', goal: 10, reward: 100 },
  { id: 'handoffs_10', icon: '🤝', title: 'Teamplayer', desc: '10 Übergaben zwischen Agents.', stat: 'handoffs', goal: 10, reward: 50 },
  { id: 'chains_10', icon: '⛓️', title: 'Fließbandprofi', desc: '10 Ketten komplett abgeschlossen.', stat: 'chains', goal: 10, reward: 120 },
  { id: 'duel_1', icon: '⚔️', title: 'Erstes Duell', desc: 'Claude und Gemini im Massenauftrag gegeneinander.', stat: 'duels', goal: 1, reward: 20 },
  { id: 'duels_20', icon: '🥊', title: 'Claude vs. Gemini', desc: '20 Duelle zwischen Claude und Gemini.', stat: 'duels', goal: 20, reward: 150 },
  { id: 'first_pass_5', icon: '🎯', title: 'Sitzt beim ersten Mal', desc: '5 Ergebnisse im ersten Anlauf vom Prüfer freigegeben.', stat: 'firstPass', goal: 5, reward: 100 },
  { id: 'schedule_1', icon: '🗓️', title: 'Schichtbetrieb', desc: 'Die erste geplante Schicht ist gelaufen.', stat: 'scheduledRuns', goal: 1, reward: 30 },
  { id: 'project_1', icon: '📁', title: 'Projektleiter', desc: 'Das erste Projekt angelegt.', stat: 'projects', goal: 1, reward: 20 },
  { id: 'archive_50', icon: '🗄️', title: 'Archivar', desc: '50 Ergebnisse im Archiv.', stat: 'archived', goal: 50, reward: 80 },
  { id: 'template_10', icon: '📜', title: 'Quest-Jäger', desc: '10 Aufträge über das Quest-Board gestartet.', stat: 'templateRuns', goal: 10, reward: 50 },
  { id: 'level_5', icon: '⭐', title: 'Expertenwissen', desc: 'Ein Agent erreicht Level 5.', stat: 'maxLevel', goal: 5, reward: 100 },
  { id: 'level_8', icon: '👑', title: 'Legende', desc: 'Ein Agent erreicht Level 8.', stat: 'maxLevel', goal: 8, reward: 300 },
  { id: 'upgrades_3', icon: '🛋️', title: 'Innenarchitekt', desc: '3 Büro-Upgrades gekauft.', stat: 'upgrades', goal: 3, reward: 50 },
  { id: 'upgrades_all', icon: '🏰', title: 'Traumbüro', desc: 'Alle Büro-Upgrades gekauft.', stat: 'upgrades', goal: UPGRADES.length, reward: 250 },
  { id: 'night_owl', icon: '🦉', title: 'Nachteule', desc: 'Ein Auftrag zwischen 0 und 5 Uhr erledigt.', stat: 'nightQuests', goal: 1, reward: 30 },
];

function computedStats() {
  const s = state.stats;
  return {
    ...s,
    maxAgents: Math.max(s.maxAgents || 0, state.agents.length),
    maxLevel: Math.max(s.maxLevel || 0, ...state.agents.map((a) => levelForXp(a.xp))),
    upgrades: state.upgrades.length,
    projects: Math.max(s.projects || 0, state.projects.length),
    archived: archive.count(),
  };
}

export function bump(stat, n = 1) {
  state.stats[stat] = (state.stats[stat] || 0) + n;
}

export function setMax(stat, value) {
  state.stats[stat] = Math.max(state.stats[stat] || 0, value);
}

// Prüft alle Erfolge, schreibt Belohnungen gut und meldet Neues an die Oberfläche.
export function checkAchievements() {
  const stats = computedStats();
  setMax('maxAgents', stats.maxAgents);
  setMax('maxLevel', stats.maxLevel);
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] || (stats[a.stat] || 0) < a.goal) continue;
    state.achievements[a.id] = Date.now();
    state.coins += a.reward;
    state.totalCoinsEarned += a.reward;
    changed = true;
    emit('achievement', { id: a.id, icon: a.icon, title: a.title, reward: a.reward });
  }
  if (changed) saveState();
  return changed;
}

export function achievementList() {
  const stats = computedStats();
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    progress: Math.min(a.goal, stats[a.stat] || 0),
    unlockedAt: state.achievements[a.id] || null,
  }));
}

export function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw Object.assign(new Error('Unbekanntes Upgrade.'), { status: 400 });
  if (state.upgrades.includes(id)) throw Object.assign(new Error('Schon gekauft.'), { status: 400 });
  if (state.coins < u.cost) throw Object.assign(new Error(`Nicht genug Münzen (${state.coins}/${u.cost}).`), { status: 400 });
  state.coins -= u.cost;
  state.upgrades.push(id);
  saveState();
  return u;
}

// Statistik aus dem Archiv: pro Agent, Antrieb und Modell.
export function statistics() {
  const groups = { agents: new Map(), providers: new Map(), models: new Map() };
  const add = (map, key, label, e) => {
    if (!map.has(key)) map.set(key, { key, label, count: 0, durationSum: 0, durationN: 0, costSum: 0, costN: 0, scoreSum: 0, scoreN: 0 });
    const g = map.get(key);
    g.count++;
    if (e.durationMs) { g.durationSum += e.durationMs; g.durationN++; }
    if (typeof e.costUsd === 'number') { g.costSum += e.costUsd; g.costN++; }
    if (typeof e.score === 'number') { g.scoreSum += e.score; g.scoreN++; }
  };
  for (const e of archive.all()) {
    add(groups.agents, e.agentId, `${e.agentAvatar || ''} ${e.agentName}`.trim(), e);
    add(groups.providers, e.provider, e.providerLabel || e.provider, e);
    add(groups.models, `${e.provider}|${e.model || 'Standard'}`, `${e.providerLabel || e.provider} · ${e.model || 'Standard'}`, e);
  }
  const finish = (map) => [...map.values()].map((g) => ({
    key: g.key,
    label: g.label,
    count: g.count,
    avgDurationMs: g.durationN ? Math.round(g.durationSum / g.durationN) : null,
    avgCostUsd: g.costN ? g.costSum / g.costN : null,
    totalCostUsd: g.costN ? g.costSum : null,
    avgScore: g.scoreN ? Math.round((g.scoreSum / g.scoreN) * 10) / 10 : null,
  })).sort((a, b) => b.count - a.count);
  return {
    totals: { ...computedStats(), coins: state.coins, totalQuests: state.totalQuests, totalCoinsEarned: state.totalCoinsEarned, morale: moraleFactor() },
    agents: finish(groups.agents),
    providers: finish(groups.providers),
    models: finish(groups.models),
  };
}
