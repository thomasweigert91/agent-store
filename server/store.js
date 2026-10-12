// Persistenz: Spielstand (Agents, Münzen) und Einstellungen als JSON in /data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const WORKSPACES_DIR = path.join(ROOT, 'workspaces');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* keine .env vorhanden */ }

export const START_COINS = 500;

function defaultState() {
  return {
    version: 1, coins: START_COINS, totalQuests: 0, totalCoinsEarned: 0, agents: [], createdAt: Date.now(),
    projects: [], activeProjectId: null, templates: [], schedules: [], upgrades: [], achievements: {}, stats: {},
    profiles: [], planItems: [],
  };
}

// Ältere Spielstände um neue Felder ergänzen.
function normalizeState(s) {
  const d = defaultState();
  for (const key of ['projects', 'templates', 'schedules', 'upgrades', 'achievements', 'stats', 'profiles', 'planItems']) {
    if (!s[key] || typeof s[key] !== 'object') s[key] = d[key];
  }
  if (s.activeProjectId === undefined) s.activeProjectId = null;
  if (s.stats.quests === undefined) s.stats.quests = s.totalQuests || 0; // Erfolge rückwirkend zählen
  return s;
}

function defaultSettings() {
  return {
    anthropicApiKey: '',
    geminiApiKey: '',
    maxParallel: 10,
    sound: true,
    historyTurnsForStateless: 12,
  };
}

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export const state = normalizeState(readJson(STATE_FILE, defaultState()));
export const settings = readJson(SETTINGS_FILE, defaultSettings());

let saveTimer = null;
export function saveState(immediate = false) {
  clearTimeout(saveTimer);
  if (immediate) return writeJsonAtomic(STATE_FILE, state);
  saveTimer = setTimeout(() => writeJsonAtomic(STATE_FILE, state), 400);
}

export function saveSettings() {
  writeJsonAtomic(SETTINGS_FILE, settings);
}

export function resetState() {
  const fresh = defaultState();
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
  saveState(true);
}

// Env-Variablen haben Vorrang, wenn in der App nichts eingetragen ist.
export function getApiKey(provider) {
  if (provider === 'anthropic') return settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  if (provider === 'gemini') return settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  return '';
}
