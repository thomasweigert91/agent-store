// Ergebnis-Archiv: jede erfolgreiche Antwort landet hier – unabhängig vom Chatverlauf der Agents.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';

const FILE = path.join(DATA_DIR, 'archive.json');
const MAX_ENTRIES = 5000;

let entries = [];
try { entries = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { entries = []; }
if (!Array.isArray(entries)) entries = [];

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(entries));
    fs.renameSync(tmp, FILE);
  }, 500);
}

export function addEntry(entry) {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  save();
  return entry;
}

export function updateEntry(id, patch) {
  const e = entries.find((x) => x.id === id);
  if (e) { Object.assign(e, patch); save(); }
  return e;
}

export function count() {
  return entries.length;
}

export function find(id) {
  return entries.find((x) => x.id === id) || null;
}

// Offene Einträge fürs Postfach (Status „offen“; ältere Einträge ohne Status zählen nicht).
export function openEntries({ projectId, profileId } = {}) {
  const out = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.status !== 'offen') continue;
    if (projectId && (projectId === 'none' ? e.projectId : e.projectId !== projectId)) continue;
    if (profileId && (profileId === 'none' ? e.profileId : e.profileId !== profileId)) continue;
    out.push(e);
  }
  return out;
}

export function countOpen() {
  let n = 0;
  for (const e of entries) if (e.status === 'offen') n++;
  return n;
}

export function clearProfile(profileId) {
  for (const e of entries) if (e.profileId === profileId) e.profileId = null;
  save();
}

// Filter: projectId ('none' = ohne Projekt, leer = alle), Volltext q, agentId. Neueste zuerst.
export function query({ projectId, q, agentId, limit = 200 } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  const out = [];
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i];
    if (projectId === 'none' ? e.projectId : projectId && e.projectId !== projectId) continue;
    if (agentId && e.agentId !== agentId) continue;
    if (needle && !`${e.prompt}\n${e.text}\n${e.agentName}`.toLowerCase().includes(needle)) continue;
    out.push(e);
  }
  return out;
}

export function all() {
  return entries;
}

export function clearProject(projectId) {
  for (const e of entries) if (e.projectId === projectId) e.projectId = null;
  save();
}
