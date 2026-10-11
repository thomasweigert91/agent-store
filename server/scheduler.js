// Schichtplan: wiederkehrende Aufträge zu festen Uhrzeiten an bestimmten Wochentagen.
import crypto from 'node:crypto';
import { state, saveState } from './store.js';
import { emit } from './events.js';

const uid = () => crypto.randomBytes(5).toString('hex');
const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function validate(body, existing = {}) {
  const title = String(body.title ?? existing.title ?? '').trim().slice(0, 60);
  const prompt = String(body.prompt ?? existing.prompt ?? '').trim().slice(0, 20000);
  const agentId = String(body.agentId ?? existing.agentId ?? '');
  const time = String(body.time ?? existing.time ?? '08:00');
  const days = Array.isArray(body.days) ? body.days.map(Number).filter((d) => d >= 0 && d <= 6) : existing.days || [1, 2, 3, 4, 5];
  if (!title) throw fail(400, 'Bitte einen Titel angeben.');
  if (!prompt) throw fail(400, 'Bitte einen Auftrag angeben.');
  if (!state.agents.some((a) => a.id === agentId)) throw fail(400, 'Bitte einen Agent auswählen.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail(400, 'Uhrzeit bitte als HH:MM angeben.');
  if (!days.length) throw fail(400, 'Bitte mindestens einen Wochentag wählen.');
  const projectId = body.projectId === undefined ? existing.projectId ?? null : body.projectId || null;
  return {
    title, prompt, agentId, time, projectId,
    days: [...new Set(days)].sort(),
    enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled ?? true,
  };
}

export function listSchedules() {
  return state.schedules.map((s) => ({ ...s, next: nextRun(s), dayNames: s.days.map((d) => DAY_NAMES[d]) }));
}

export function createSchedule(body) {
  const s = { id: uid(), createdAt: Date.now(), lastRunDate: null, runs: 0, ...validate(body) };
  // Heute nicht sofort nachholen, wenn die Uhrzeit beim Anlegen schon vorbei ist.
  const now = new Date();
  if (s.days.includes(now.getDay()) && minutesOf(s.time) <= now.getHours() * 60 + now.getMinutes()) s.lastRunDate = dateKey(now);
  state.schedules.push(s);
  saveState();
  return s;
}

export function updateSchedule(id, body) {
  const s = state.schedules.find((x) => x.id === id);
  if (!s) throw fail(404, 'Schicht nicht gefunden.');
  Object.assign(s, validate(body, s));
  saveState();
  return s;
}

export function deleteSchedule(id) {
  state.schedules = state.schedules.filter((x) => x.id !== id);
  saveState();
}

export function removeAgentSchedules(agentId) {
  const before = state.schedules.length;
  state.schedules = state.schedules.filter((s) => s.agentId !== agentId);
  return before - state.schedules.length;
}

const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Nächster Lauf als Zeitstempel (ms) oder null.
export function nextRun(s, from = new Date()) {
  if (!s.enabled || !s.days.length) return null;
  for (let add = 0; add < 8; add++) {
    const d = new Date(from);
    d.setDate(d.getDate() + add);
    d.setHours(Number(s.time.slice(0, 2)), Number(s.time.slice(3, 5)), 0, 0);
    if (!s.days.includes(d.getDay())) continue;
    if (add === 0 && (s.lastRunDate === dateKey(from) || d.getTime() < from.getTime() - 60000)) continue;
    return d.getTime();
  }
  return null;
}

// Nächste Schicht eines Agents (für Wanduhr und Schreibtisch-Chip).
export function nextShiftFor(agentId) {
  let best = null;
  for (const s of state.schedules) {
    if (s.agentId !== agentId) continue;
    const n = nextRun(s);
    if (n && (!best || n < best.at)) best = { at: n, time: s.time, title: s.title };
  }
  return best;
}

let enqueueFn = null;
let onRunFn = null;

function tick() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = dateKey(now);
  for (const s of state.schedules) {
    if (!s.enabled || !s.days.includes(now.getDay()) || s.lastRunDate === today) continue;
    if (minutesOf(s.time) > nowMin) continue;
    s.lastRunDate = today;
    s.runs = (s.runs || 0) + 1;
    try {
      enqueueFn(s.agentId, s.prompt, { projectId: s.projectId, source: 'schedule', scheduleTitle: s.title });
      emit('toast', { kind: 'info', text: `🗓️ Schicht „${s.title}“ gestartet` });
      onRunFn?.(s);
    } catch (err) {
      emit('toast', { kind: 'error', text: `🗓️ Schicht „${s.title}“ konnte nicht starten: ${err.message}` });
    }
    saveState();
  }
}

// Startet die Prüfung alle 20 Sekunden. Verpasste Schichten des laufenden Tages werden nachgeholt.
export function startScheduler(enqueue, onRun) {
  enqueueFn = enqueue;
  onRunFn = onRun;
  tick();
  setInterval(tick, 20000);
}
