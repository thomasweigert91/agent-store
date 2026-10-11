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
