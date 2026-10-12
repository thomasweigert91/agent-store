// Kontext-Profile: wiederverwendbarer Hintergrund (Firma, Shop, Kanal …), der Aufträgen vorangestellt wird.
import crypto from 'node:crypto';
import { state, saveState } from './store.js';

const uid = () => crypto.randomBytes(5).toString('hex');
const MAX_PREFS = 40;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const list = (v, maxItems, maxLen) => (Array.isArray(v) ? v : String(v ?? '').split('\n'))
  .map((x) => String(x).trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems);

export function findProfile(id) {
  return id ? state.profiles.find((p) => p.id === id) || null : null;
}

export function listProfiles() {
  return state.profiles;
}

function validate(body, existing = {}) {
  const name = str(body.name ?? existing.name, 60);
  if (!name) throw fail(400, 'Bitte einen Profilnamen angeben.');
  return {
    name,
    icon: str(body.icon ?? existing.icon ?? '🏢', 8) || '🏢',
    purpose: str(body.purpose ?? existing.purpose, 1000),
    offer: str(body.offer ?? existing.offer, 1500),
    audience: str(body.audience ?? existing.audience, 1000),
    tone: str(body.tone ?? existing.tone, 1000),
    rules: str(body.rules ?? existing.rules, 1500),
    examples: body.examples !== undefined ? list(body.examples, 10, 1500) : existing.examples || [],
    prefs: body.prefs !== undefined ? list(body.prefs, MAX_PREFS, 300) : existing.prefs || [],
  };
}

export function createProfile(body) {
  const p = { id: uid(), createdAt: Date.now(), ...validate(body) };
  state.profiles.push(p);
  saveState();
  return p;
}

export function updateProfile(id, body) {
  const p = findProfile(id);
  if (!p) throw fail(404, 'Profil nicht gefunden.');
  Object.assign(p, validate(body, p));
  saveState();
  return p;
}

export function deleteProfile(id) {
  if (!findProfile(id)) throw fail(404, 'Profil nicht gefunden.');
  state.profiles = state.profiles.filter((p) => p.id !== id);
  for (const pr of state.projects) if (pr.profileId === id) pr.profileId = null;
  for (const it of state.planItems) if (it.profileId === id) it.profileId = null;
  saveState();
}

// Gelernte Vorliebe aus dem Postfach-Feedback speichern (neueste zuerst, ohne Dubletten).
export function addPreference(id, text) {
  const p = findProfile(id);
  const t = str(text, 300);
  if (!p || !t) return null;
  p.prefs = [t, ...(p.prefs || []).filter((x) => x !== t)].slice(0, MAX_PREFS);
  saveState();
  return p;
}

// Profil für einen Auftrag bestimmen: undefined = Standard des Projekts, null/'none' = keins.
export function resolveProfileId(requested, project) {
  if (requested === undefined) return project?.profileId && findProfile(project.profileId) ? project.profileId : null;
  if (!requested || requested === 'none') return null;
  return findProfile(requested) ? requested : null;
}

// Kompakter Kontextblock, der dem Auftrag vorangestellt wird.
export function profilePreamble(p) {
  const lines = [`[Kontext-Profil „${p.name}“]`];
  if (p.purpose) lines.push(`Zweck/Ziel: ${p.purpose}`);
  if (p.offer) lines.push(`Angebot: ${p.offer}`);
  if (p.audience) lines.push(`Zielgruppe: ${p.audience}`);
  if (p.tone) lines.push(`Ton/Stil: ${p.tone}`);
  if (p.rules) lines.push(`Regeln & No-Gos: ${p.rules}`);
  if (p.examples?.length) lines.push(`Beispiele, die gefallen:\n${p.examples.map((e) => `- ${e.replace(/\n+/g, ' ').slice(0, 400)}`).join('\n')}`);
  if (p.prefs?.length) lines.push(`Gelernte Vorlieben (aus Feedback):\n${p.prefs.slice(0, 15).map((e) => `- ${e}`).join('\n')}`);
  return lines.join('\n') + '\n\n';
}
