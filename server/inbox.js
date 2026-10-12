// Freigabe-Postfach: alle offenen Ergebnisse und angehaltenen Weitergaben an einem Ort.
import { state } from './store.js';
import { emit } from './events.js';
import * as archive from './archive.js';
import { findPlanItem, setStatus as setPlanStatus } from './planner.js';
import { findProfile, addPreference } from './profiles.js';

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

const norm = (s) => String(s).toUpperCase().replace(/[^A-ZÄÖÜ0-9]+/g, '');

// Abschnitte einer strukturierten Antwort erkennen ("CAPTION:", "**Hashtags:**", "## BILD-PROMPT" …).
export function parseSections(text, structure) {
  if (!structure?.length || !text) return [];
  const wanted = new Map(structure.map((s) => [norm(s), s]));
  const found = [];
  let current = null;
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*([A-Za-zÄÖÜäöü][A-Za-zÄÖÜäöü0-9 \-]{1,30}?)\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/);
    const key = m ? norm(m[1]) : null;
    if (key && wanted.has(key)) {
      current = { name: wanted.get(key), text: m[2] ? m[2].trim() : '' };
      found.push(current);
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line;
    }
  }
  for (const s of found) s.text = s.text.replace(/^\s+|\s+$/g, '');
  return found.filter((s) => s.text);
}

const countHashtags = (t) => (String(t).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;

export function limitWarnings(entry, sections) {
  const lim = entry.limits;
  if (!lim) return [];
  const text = entry.finalText || entry.text;
  const out = [];
  if (lim.maxChars) {
    const sec = lim.section ? sections.find((s) => norm(s.name) === norm(lim.section)) : null;
    const len = (sec ? sec.text : text).length;
    if (len > lim.maxChars) out.push(`${sec ? sec.name : 'Text'}: ${len} Zeichen (max. ${lim.maxChars})`);
  }
  if (lim.maxHashtags) {
    const tags = sections.find((s) => norm(s.name) === 'HASHTAGS');
    const n = countHashtags(tags ? tags.text : text);
    if (n > lim.maxHashtags) out.push(`${n} Hashtags (max. ${lim.maxHashtags})`);
  }
  return out;
}

function decorate(e) {
  const sections = parseSections(e.finalText || e.text, e.structure);
  const plan = findPlanItem(e.planItemId);
  return {
    kind: 'result',
    ...e,
    sections,
    warnings: limitWarnings(e, sections),
    planItem: plan ? { id: plan.id, title: plan.title, date: plan.date, type: plan.type } : null,
  };
}

export function listInbox({ projectId, profileId } = {}) {
  const results = archive.openEntries({ projectId, profileId }).map(decorate);
  const relays = state.agents
    .filter((a) => a.pendingRelay)
    .filter((a) => !projectId || (projectId === 'none' ? !a.pendingRelay.projectId : a.pendingRelay.projectId === projectId))
    .map((a) => {
      const msg = a.messages.find((m) => m.id === a.pendingRelay.messageId);
      return {
        kind: 'relay',
        id: `relay-${a.id}`,
        agentId: a.id,
        agentName: a.name,
        agentAvatar: a.avatar,
        toName: a.pendingRelay.toName,
        ts: a.pendingRelay.ts,
        projectId: a.pendingRelay.projectId || null,
        text: a.pendingRelay.text || msg?.text || '',
      };
    });
  return [...relays, ...results].sort((x, y) => (y.escalated ? 1 : 0) - (x.escalated ? 1 : 0) || y.ts - x.ts);
}

function changed() {
  emit('inbox', { count: archive.countOpen() + state.agents.filter((a) => a.pendingRelay).length });
}

function entryOrFail(id) {
  const e = archive.find(id);
  if (!e) throw fail(404, 'Ergebnis nicht gefunden.');
  return e;
}

function learn(e, text) {
  if (!text || !e.profileId || !findProfile(e.profileId)) return false;
  addPreference(e.profileId, text);
  return true;
}

export function approve(id, { note, learn: doLearn } = {}) {
  const e = entryOrFail(id);
  archive.updateEntry(id, { status: 'freigegeben', decidedAt: Date.now(), note: note || null });
  if (e.planItemId) setPlanStatus(e.planItemId, 'freigegeben');
  const learned = doLearn ? learn(e, `Gefällt: ${note || `„${(e.prompt || '').split('\n')[0].slice(0, 120)}“ wurde so freigegeben`}`) : false;
  changed();
  return { ok: true, learned };
}

export function reject(id, { reason, learn: doLearn } = {}) {
  const e = entryOrFail(id);
  archive.updateEntry(id, { status: 'abgelehnt', decidedAt: Date.now(), note: reason || null });
  if (e.planItemId) setPlanStatus(e.planItemId, 'idee');
  const learned = doLearn && reason ? learn(e, `Vermeiden: ${reason}`) : false;
  changed();
  return { ok: true, learned };
}

export function done(id) {
  const e = entryOrFail(id);
  archive.updateEntry(id, { status: 'erledigt', decidedAt: Date.now() });
  if (e.planItemId) setPlanStatus(e.planItemId, 'erledigt');
  changed();
  return { ok: true };
}

export function edit(id, { text }) {
  entryOrFail(id);
  const t = String(text || '').trim();
  if (!t) throw fail(400, 'Leerer Text.');
  archive.updateEntry(id, { finalText: t.slice(0, 100000), editedAt: Date.now() });
  return decorate(archive.find(id));
}

// "Nochmal mit Hinweis": Überarbeitung beim selben Agent beauftragen, Eintrag gilt als erledigt.
export function revise(id, { hint, learn: doLearn } = {}, enqueue) {
  const e = entryOrFail(id);
  const h = String(hint || '').trim();
  if (!h) throw fail(400, 'Bitte einen Hinweis angeben.');
  if (!state.agents.some((a) => a.id === e.agentId)) throw fail(400, 'Der Agent ist nicht mehr im Team.');
  enqueue(e.agentId, `Überarbeite dein Ergebnis anhand dieses Hinweises: ${h}\n\nBisheriges Ergebnis:\n"""\n${e.finalText || e.text}\n"""`
    + (e.structure?.length ? `\n\nBehalte die Abschnitte bei: ${e.structure.map((s) => `${s}:`).join(' ')}` : ''), {
    projectId: e.projectId ?? null,
    profileId: e.profileId || 'none',
    source: 'revision',
    templateTitle: '✏️ Überarbeitung',
    structure: e.structure || undefined,
    limits: e.limits || undefined,
    planItemId: e.planItemId || undefined,
  });
  archive.updateEntry(id, { status: 'abgelehnt', decidedAt: Date.now(), note: `Überarbeitung angefordert: ${h}` });
  const learned = doLearn ? learn(e, `Hinweis: ${h}`) : false;
  changed();
  return { ok: true, learned };
}

export function notifyChanged() {
  changed();
}
