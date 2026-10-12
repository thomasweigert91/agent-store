// Planer: datierte Vorhaben (Posts, Newsletter, Angebote, Recherchen, Deadlines …) mit Entwurf per Agent.
import crypto from 'node:crypto';
import { state, saveState } from './store.js';
import { emit } from './events.js';

const uid = () => crypto.randomBytes(5).toString('hex');
export const PLAN_TYPES = ['Post', 'Newsletter', 'Angebot', 'Recherche', 'Deadline', 'Sonstiges'];
export const PLAN_STATUS = ['idee', 'entwurf', 'freigegeben', 'erledigt'];

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

export function findPlanItem(id) {
  return id ? state.planItems.find((x) => x.id === id) || null : null;
}

// Einträge im Zeitraum [from, to] (YYYY-MM-DD), sortiert nach Datum.
export function listPlanItems({ from, to } = {}) {
  return state.planItems
    .filter((x) => (!from || x.date >= from) && (!to || x.date <= to))
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

function validate(body, existing = {}) {
  const title = String(body.title ?? existing.title ?? '').trim().slice(0, 120);
  const date = String(body.date ?? existing.date ?? '');
  if (!title) throw fail(400, 'Bitte einen Titel angeben.');
  if (!isDate(date)) throw fail(400, 'Bitte ein Datum angeben.');
  const pick = (k, d = null) => (body[k] !== undefined ? body[k] || null : existing[k] ?? d);
  const status = body.status !== undefined ? body.status : existing.status || 'idee';
  if (!PLAN_STATUS.includes(status)) throw fail(400, 'Unbekannter Status.');
  return {
    title,
    date,
    type: String(body.type ?? existing.type ?? 'Sonstiges').trim().slice(0, 30) || 'Sonstiges',
    notes: String(body.notes ?? existing.notes ?? '').slice(0, 5000),
    projectId: pick('projectId'),
    profileId: pick('profileId'),
    agentId: pick('agentId'),
    templateId: pick('templateId'),
    status,
  };
}

export function createPlanItem(body) {
  const it = { id: uid(), createdAt: Date.now(), resultId: null, values: {}, ...validate(body) };
  if (body.values && typeof body.values === 'object') it.values = body.values;
  state.planItems.push(it);
  saveState();
  return it;
}

export function updatePlanItem(id, body) {
  const it = findPlanItem(id);
  if (!it) throw fail(404, 'Eintrag nicht gefunden.');
  Object.assign(it, validate(body, it));
  if (body.values && typeof body.values === 'object') it.values = body.values;
  saveState();
  return it;
}

export function deletePlanItem(id) {
  state.planItems = state.planItems.filter((x) => x.id !== id);
  saveState();
}

export function setStatus(id, status) {
  const it = findPlanItem(id);
  if (!it || !PLAN_STATUS.includes(status)) return null;
  it.status = status;
  saveState();
  return it;
}

// Fertiges Ergebnis mit dem Eintrag verknüpfen → Status „Entwurf“.
export function linkResult(id, resultId) {
  const it = findPlanItem(id);
  if (!it) return null;
  it.resultId = resultId;
  it.pending = false;
  if (it.status === 'idee') it.status = 'entwurf';
  saveState();
  emit('plan', {});
  return it;
}

// Aus einer Liste (eine Zeile je Thema) Einträge über mehrere Tage verteilen.
export function planMany({ lines, startDate, everyDays = 1, ...common }) {
  const titles = (Array.isArray(lines) ? lines : String(lines || '').split('\n'))
    .map((l) => String(l).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, 60);
  if (!titles.length) throw fail(400, 'Keine Themen gefunden – eine Zeile pro Thema.');
  if (!isDate(startDate)) throw fail(400, 'Bitte ein Startdatum angeben.');
  const step = Math.max(1, Math.min(30, Math.round(Number(everyDays) || 1)));
  const [y, m, d] = startDate.split('-').map(Number);
  return titles.map((title, i) => {
    const dt = new Date(y, m - 1, d + i * step);
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return createPlanItem({ ...common, title, date });
  });
}

export function clearPending(id) {
  const it = findPlanItem(id);
  if (it?.pending) { it.pending = false; saveState(); emit('plan', {}); }
}

export function removeAgent(agentId) {
  for (const it of state.planItems) if (it.agentId === agentId) it.agentId = null;
}
