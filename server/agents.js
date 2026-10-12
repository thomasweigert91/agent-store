// Agent-Manager: Rekrutieren, Aufträge (Queue), parallele Ausführung, Belohnungen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { state, settings, saveState, WORKSPACES_DIR } from './store.js';
import { emit } from './events.js';
import { CATALOG, randomName, levelForXp, levelTitle, xpBounds } from './catalog.js';
import { getProvider, providerStatus } from './providers/index.js';
import * as archive from './archive.js';
import { findProject, projectFolder, projectPreamble, saveResultFile } from './projects.js';
import { personaWithTalents, activeTalents, moraleFactor, bump, checkAchievements, TALENTS } from './progress.js';
import { nextShiftFor, removeAgentSchedules } from './scheduler.js';
import { findProfile, profilePreamble, resolveProfileId } from './profiles.js';
import { linkResult, clearPending as clearPlanPending, removeAgent as removePlanAgent } from './planner.js';

export const MAX_AGENTS = 10;        // Plätze pro Büro
const MAX_TOTAL_AGENTS = 60;         // Agents insgesamt (alle Projekte)
const MAX_MESSAGES = 300;
const PREVIEW_CHARS = 4000;
const AUTONOMY = ['safe', 'edits', 'auto', 'full'];
const MAX_CHAIN_STEPS = 6;   // max. automatische Weitergaben pro Kette (Schutz gegen Endlosschleifen)
const FIRST_PASS_BONUS = 15; // Prüfer gibt im ersten Anlauf frei
const APPROVAL_BONUS = 5;    // Prüfer gibt frei
const REVIEW_SUFFIX = '\n\n---\nDu bist in diesem Schritt PRÜFER. Bewerte das Ergebnis oben streng und fair. '
  + 'Wenn es noch nicht gut genug ist, nenne vorher konkrete, nummerierte Verbesserungspunkte. '
  + 'Schließe deine Antwort GENAU mit diesen zwei Zeilen ab:\nNOTE: <0-10>/10\nENTSCHEIDUNG: OK oder ÜBERARBEITEN';
const HANDOFF_BONUS = 5;     // Bonus-Münzen pro erfolgreicher Übergabe
const DEFAULT_HANDOFF_INSTRUCTION = 'Arbeite mit dem folgenden Ergebnis weiter.';

const running = new Map(); // agentId -> AbortController
const live = new Map();    // agentId -> { activity, partial, startedAt, prompt, tools }
export const limitsCache = { value: null }; // letzte Abo-Auslastung (Claude)

const uid = () => crypto.randomBytes(5).toString('hex');

export function findAgent(id) {
  return state.agents.find((a) => a.id === id);
}

function workspaceFor(agent) {
  if (!agent.workspaceDir) agent.workspaceDir = path.join(WORKSPACES_DIR, agent.id);
  return agent.workspaceDir;
}

// ---------------------------------------------------------------- Teams & Büros
// Jedes Projekt hat ein eigenes Büro mit 10 Plätzen, dazu das Büro "Kein Projekt" ('_').
// Stammpersonal (projectId = null) sitzt in jedem Büro, Projekt-Agents nur in ihrem.
const viewKey = (projectId) => projectId || '_';
const activeView = () => viewKey(state.activeProjectId && state.projects.some((p) => p.id === state.activeProjectId) ? state.activeProjectId : null);
const allViews = () => ['_', ...state.projects.map((p) => p.id)];
const agentViews = (agent) => (agent.projectId ? [agent.projectId] : allViews());
const inView = (agent, key) => !agent.projectId || agent.projectId === key;
const viewAgents = (key, except = null) => state.agents.filter((a) => a !== except && inView(a, key));

function freeSlot(key, preferred, except = null) {
  const used = new Set(viewAgents(key, except).map((a) => a.slots?.[key]).filter((s) => s != null));
  if (Number.isInteger(preferred) && preferred >= 0 && preferred < MAX_AGENTS && !used.has(preferred)) return preferred;
  for (let i = 0; i < MAX_AGENTS; i++) if (!used.has(i)) return i;
  return -1;
}

// Kapazität prüfen, bevor ein Agent in ein Büro (bzw. als Stammpersonal in alle) kommt.
function checkCapacity(targetProjectId, except = null) {
  const keys = targetProjectId ? [targetProjectId] : allViews();
  for (const key of keys) {
    if (viewAgents(key, except).length >= MAX_AGENTS) {
      const p = state.projects.find((x) => x.id === key);
      throw fail(400, `${p ? `Das Büro von „${p.name}“` : 'Das Büro „Kein Projekt“'} ist voll (${MAX_AGENTS} Plätze) – entlasse dort erst jemanden.`);
    }
  }
}

// Plätze aller Agents in allen Büros vergeben/aufräumen (ohne Doppelbelegung).
export function ensureSlots() {
  const views = allViews();
  for (const key of views) {
    const used = new Set();
    for (const a of state.agents) {
      a.slots ||= {};
      if (!inView(a, key)) continue;
      let s = a.slots[key];
      if (s == null || used.has(s) || s >= MAX_AGENTS) {
        const pref = Object.values(a.slots).find((v) => v != null && !used.has(v));
        s = pref != null ? pref : null;
        if (s == null || used.has(s)) { s = 0; while (used.has(s) && s < MAX_AGENTS) s++; }
        a.slots[key] = s;
      }
      used.add(s);
    }
  }
  for (const a of state.agents) {
    for (const key of Object.keys(a.slots || {})) if (!views.includes(key) || !inView(a, key)) delete a.slots[key];
  }
}

export function teamInfo() {
  return { activeView: activeView(), views: allViews() };
}

export function agentCwd(agent) {
  const dir = agent.workdir && fs.existsSync(agent.workdir) ? agent.workdir : workspaceFor(agent);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Öffentliche Sicht auf einen Agent (inkl. Live-Infos und Level-Daten).
export function publicAgent(agent, { withMessages = false } = {}) {
  const level = levelForXp(agent.xp);
  const bounds = xpBounds(level);
  const l = live.get(agent.id);
  const out = {
    ...agent,
    level,
    levelTitle: levelTitle(level),
    xpFrom: bounds.from,
    xpTo: bounds.to,
    running: running.has(agent.id),
    live: l ? { activity: l.activity, partial: l.partial.slice(-PREVIEW_CHARS), startedAt: l.startedAt, prompt: l.prompt, tools: l.tools } : null,
    cwd: agent.workdir || workspaceFor(agent),
    slot: agent.slots?.[activeView()] ?? null,   // Platz im aktuell angezeigten Büro
    inView: inView(agent, activeView()),
    nextShift: nextShiftFor(agent.id),
    talents: activeTalents(agent).map((t) => t.id),
    messageCount: agent.messages.length,
    lastMessage: agent.messages.length ? agent.messages[agent.messages.length - 1] : null,
  };
  if (!withMessages) delete out.messages;
  return out;
}

function pushUpdate(agent) {
  emit('agent', publicAgent(agent));
}

function pushGame() {
  emit('game', gameInfo());
}

export function refreshAgent(id) {
  const a = findAgent(id);
  if (a) pushUpdate(a);
}

export function gameInfo() {
  return {
    upgrades: state.upgrades,
    activeProjectId: state.activeProjectId,
    morale: moraleFactor(),
    coins: state.coins,
    totalQuests: state.totalQuests,
    totalCoinsEarned: state.totalCoinsEarned,
    agentCount: viewAgents(activeView()).length,
    totalAgents: state.agents.length,
    working: running.size,
    workingElsewhere: state.agents.filter((a) => running.has(a.id) && !inView(a, activeView())).length,
    inboxCount: archive.countOpen() + state.agents.filter((a) => a.pendingRelay).length,
    maxAgents: MAX_AGENTS,
  };
}

function addMessage(agent, msg) {
  const m = { id: uid(), ts: Date.now(), ...msg };
  agent.messages.push(m);
  if (agent.messages.length > MAX_MESSAGES) agent.messages.splice(0, agent.messages.length - MAX_MESSAGES);
  return m;
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function recruit({ archetypeId, name, provider, model, slot, projectId }) {
  const arch = CATALOG.find((c) => c.id === archetypeId);
  if (!arch) throw fail(400, 'Unbekannte Agent-Klasse.');
  if (state.agents.length >= MAX_TOTAL_AGENTS) throw fail(400, `Maximal ${MAX_TOTAL_AGENTS} Agents insgesamt – entlasse erst jemanden.`);
  // Standard: Projekt-Agent im aktiven Projekt; ohne aktives Projekt Stammpersonal.
  const target = projectId === undefined ? (state.projects.some((p) => p.id === state.activeProjectId) ? state.activeProjectId : null) : projectId || null;
  if (target && !state.projects.some((p) => p.id === target)) throw fail(400, 'Projekt nicht gefunden.');
  checkCapacity(target);
  if (state.coins < arch.cost) throw fail(400, `Nicht genug Münzen (${state.coins}/${arch.cost}). Erledige Aufträge, um Münzen zu verdienen.`);

  const chosenProvider = getProvider(provider) ? provider : pickDefaultProvider(arch.provider);
  const view = activeView();
  const agent = {
    id: uid(),
    projectId: target,
    slots: inView({ projectId: target }, view) ? { [view]: freeSlot(view, slot) } : {},
    projectPrompts: {},
    name: (name || '').trim().slice(0, 24) || randomName(state.agents.map((a) => a.name)),
    archetype: arch.id,
    archetypeTitle: arch.title,
    avatar: arch.avatar,
    color: arch.color,
    rarity: arch.rarity,
    provider: chosenProvider,
    model: (model ?? getProvider(chosenProvider).info.defaultModel ?? '').trim(),
    persona: arch.persona,
    autonomy: arch.autonomy || 'safe',
    workdir: '',
    xp: 0,
    questsDone: 0,
    coinsEarned: 0,
    status: 'idle',
    unread: 0,
    queue: [],
    messages: [],
    sessionId: null,
    hiredAt: Date.now(),
    cost: arch.cost,
  };
  state.coins -= arch.cost;
  state.agents.push(agent);
  ensureSlots();
  const teamName = target ? `dem Team von „${state.projects.find((p) => p.id === target).name}“` : 'dem Stammpersonal (alle Projekte)';
  addMessage(agent, { role: 'system', text: `${agent.avatar} ${agent.name} (${arch.title}) ist ${teamName} beigetreten!` });
  saveState();
  pushUpdate(agent);
  pushGame();
  emit('toast', { kind: 'recruit', text: `${agent.avatar} ${agent.name} wurde rekrutiert!` });
  return agent;
}

// Bevorzugten Provider nehmen, sonst den ersten verfügbaren.
function pickDefaultProvider(preferred) {
  if (providerStatus[preferred]?.available) return preferred;
  for (const id of ['claude-cli', 'antigravity-cli', 'claude-api', 'gemini-api']) {
    if (providerStatus[id]?.available) return id;
  }
  return 'demo';
}

export function updateAgent(id, patch) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  if (typeof patch.name === 'string' && patch.name.trim()) agent.name = patch.name.trim().slice(0, 24);
  if (typeof patch.avatar === 'string' && patch.avatar.trim()) agent.avatar = patch.avatar.trim().slice(0, 8);
  if (typeof patch.persona === 'string') agent.persona = patch.persona.slice(0, 8000);
  if (patch.look && typeof patch.look === 'object') {
    const idx = (v) => (Number.isInteger(v) && v >= 0 && v < 16 ? v : 0);
    agent.look = { hair: idx(patch.look.hair), hairColor: idx(patch.look.hairColor), skin: idx(patch.look.skin), acc: idx(patch.look.acc) };
  }
  if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) agent.color = patch.color;
  if (typeof patch.autonomy === 'string' && AUTONOMY.includes(patch.autonomy)) agent.autonomy = patch.autonomy;
  if (typeof patch.provider === 'string' && getProvider(patch.provider) && patch.provider !== agent.provider) {
    agent.provider = patch.provider;
    agent.sessionId = null;
    if (typeof patch.model !== 'string') agent.model = getProvider(patch.provider).info.defaultModel || '';
  }
  if (typeof patch.model === 'string') {
    const m = patch.model.trim();
    if (m && !/^[\w.\-:\[\]]+$/.test(m)) throw fail(400, 'Modellname enthält ungültige Zeichen.');
    agent.model = m;
  }
  if (typeof patch.workdir === 'string') {
    const wd = patch.workdir.trim();
    if (wd && !fs.existsSync(wd)) throw fail(400, 'Arbeitsordner existiert nicht: ' + wd);
    if (wd !== agent.workdir) agent.sessionId = null; // Claude-Sessions hängen am Ordner
    agent.workdir = wd;
  }
  if (patch.relay === null || (patch.relay && !patch.relay.toAgentId)) {
    agent.relay = null;
  } else if (patch.relay && typeof patch.relay === 'object') {
    const target = findAgent(patch.relay.toAgentId);
    if (!target) throw fail(400, 'Ziel-Agent für die Weitergabe existiert nicht.');
    if (target.id === agent.id) throw fail(400, 'Ein Agent kann nicht an sich selbst weitergeben.');
    agent.relay = {
      toAgentId: target.id,
      instruction: String(patch.relay.instruction || '').trim().slice(0, 2000),
      requireApproval: Boolean(patch.relay.requireApproval),
    };
  }
  if (patch.review && typeof patch.review === 'object') {
    const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
    agent.review = {
      enabled: Boolean(patch.review.enabled),
      minScore: clamp(patch.review.minScore, 1, 10, 7),
      maxRounds: clamp(patch.review.maxRounds, 1, 5, 3),
    };
  }
  if (Array.isArray(patch.talentsOff)) {
    agent.talentsOff = patch.talentsOff.filter((t) => TALENTS.some((x) => x.id === t));
  }
  // Zugehörigkeit: Projekt-Agent oder Stammpersonal ('' / null)
  if (patch.projectId !== undefined) {
    const target = patch.projectId || null;
    if (target && !state.projects.some((p) => p.id === target)) throw fail(400, 'Projekt nicht gefunden.');
    if (target !== (agent.projectId || null)) {
      checkCapacity(target, agent);
      agent.projectId = target;
      ensureSlots();
      for (const a of state.agents) if (a !== agent) pushUpdate(a);
    }
  }
  // Projekt-Ergänzungen zum Basis-Prompt (nur für Stammpersonal wirksam)
  if (patch.projectPrompts && typeof patch.projectPrompts === 'object') {
    agent.projectPrompts = {};
    for (const [pid, text] of Object.entries(patch.projectPrompts)) {
      const t = String(text || '').trim().slice(0, 4000);
      if (t && state.projects.some((p) => p.id === pid)) agent.projectPrompts[pid] = t;
    }
  }
  // Platz im aktuell angezeigten Büro tauschen
  const view = activeView();
  if (Number.isInteger(patch.slot) && patch.slot >= 0 && patch.slot < MAX_AGENTS && inView(agent, view) && patch.slot !== agent.slots?.[view]) {
    const other = viewAgents(view, agent).find((a) => a.slots?.[view] === patch.slot);
    if (other) { other.slots[view] = agent.slots[view]; pushUpdate(other); }
    agent.slots[view] = patch.slot;
  }
  saveState();
  pushUpdate(agent);
  return agent;
}

export function dismiss(id) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  stop(id);
  const refund = Math.floor((agent.cost || 0) / 2);
  state.coins += refund;
  state.agents = state.agents.filter((a) => a.id !== id);
  live.delete(id);
  removeAgentSchedules(id);
  removePlanAgent(id);
  // Ketten, die auf den entlassenen Agent zeigen, auflösen.
  for (const other of state.agents) {
    if (other.relay?.toAgentId === id) {
      other.relay = null;
      addMessage(other, { role: 'system', text: `🔗 Automatische Weitergabe an ${agent.name} entfernt (entlassen).` });
      pushUpdate(other);
    }
  }
  saveState();
  emit('agentRemoved', { id });
  pushGame();
  emit('toast', { kind: 'info', text: `${agent.avatar} ${agent.name} wurde entlassen${refund ? ` (+${refund} 🪙 Abfindung zurück)` : ''}.` });
}

export function enqueue(id, prompt, opts = {}) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  const text = String(prompt || '').trim();
  if (!text) throw fail(400, 'Leerer Auftrag.');
  if (text.length > 100000) throw fail(400, 'Auftrag ist zu lang (max. 100.000 Zeichen).');
  // Standard-Projekt: das eigene Projekt des Agents, bei Stammpersonal das aktive Projekt.
  const projectId = opts.projectId !== undefined ? opts.projectId : agent.projectId || state.activeProjectId;
  const project = findProject(projectId);
  agent.queue.push({
    id: uid(),
    prompt: text,
    ts: Date.now(),
    projectId: project ? projectId : null,
    profileId: resolveProfileId(opts.profileId, project),
    source: opts.source || 'manual',
    ...(opts.planItemId ? { planItemId: opts.planItemId } : {}),
    ...(opts.structure?.length ? { structure: opts.structure } : {}),
    ...(opts.limits ? { limits: opts.limits } : {}),
    ...(opts.scheduleTitle ? { scheduleTitle: opts.scheduleTitle } : {}),
    ...(opts.templateTitle ? { templateTitle: opts.templateTitle } : {}),
  });
  saveState();
  pushUpdate(agent);
  pump();
  return agent;
}

/**
 * Übergibt eine Antwort von Agent `fromId` als neuen Auftrag an einen anderen Agent.
 * chainId/step werden bei Ketten mitgeführt, round/returnTo bei Prüfer-Runden.
 * Mit `text` kann statt einer Nachricht ein beliebiger Text übergeben werden.
 */
export function handoff(fromId, { toAgentId, messageId, text, instruction, chainId, step = 1, round, returnTo, projectId, profileId } = {}) {
  const from = findAgent(fromId);
  if (!from) throw fail(404, 'Agent nicht gefunden.');
  const to = findAgent(toAgentId);
  if (!to) throw fail(400, 'Ziel-Agent nicht gefunden.');
  if (to.id === from.id) throw fail(400, 'Ein Agent kann nicht an sich selbst übergeben.');
  const answers = from.messages.filter((m) => m.role === 'assistant');
  const msg = messageId ? answers.find((m) => m.id === messageId) : answers[answers.length - 1];
  const content = text ?? msg?.text;
  if (!content) throw fail(400, 'Keine Antwort zum Weitergeben gefunden.');

  const instr = String(instruction || '').trim().slice(0, 2000) || DEFAULT_HANDOFF_INSTRUCTION;
  const header = `${instr}\n\nErgebnis von ${from.name} (${from.archetypeTitle}):\n\n`;
  const prompt = header + content.slice(0, 100000 - header.length);
  const pid = projectId !== undefined ? projectId : msg?.meta?.projectId ?? null;
  to.queue.push({
    id: uid(),
    prompt,
    ts: Date.now(),
    from: { agentId: from.id, name: from.name, title: from.archetypeTitle, avatar: from.avatar },
    instruction: instr,
    resultStart: header.length,
    chainId: chainId || uid(),
    step,
    projectId: findProject(pid) ? pid : null,
    profileId: (() => { const p = profileId !== undefined ? profileId : msg?.meta?.profileId ?? null; return findProfile(p) ? p : null; })(),
    source: 'handoff',
    ...(round ? { round } : {}),
    ...(returnTo ? { returnTo } : {}),
  });
  state.coins += HANDOFF_BONUS;
  state.totalCoinsEarned += HANDOFF_BONUS;
  bump('handoffs');
  saveState();
  pushUpdate(to);
  pushGame();
  emit('handoff', {
    fromId: from.id, toId: to.id,
    fromName: from.name, toName: to.name,
    fromAvatar: from.avatar, toAvatar: to.avatar,
    step, bonus: HANDOFF_BONUS, auto: Boolean(chainId), round: round || null,
  });
  pump();
  return to;
}

// Entscheidung über eine angehaltene Weitergabe (Freigabe-Gate).
export function relayDecision(id, approve) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  const pending = agent.pendingRelay;
  if (!pending) throw fail(400, 'Keine Weitergabe wartet auf Freigabe.');
  agent.pendingRelay = null;
  if (approve) {
    const { toName, ts, ...payload } = pending;
    try {
      handoff(agent.id, payload);
      addMessage(agent, { role: 'system', text: `✅ Freigegeben – an ${toName} weitergegeben.` });
    } catch (err) {
      addMessage(agent, { role: 'error', text: 'Weitergabe fehlgeschlagen: ' + err.message });
    }
  } else {
    addMessage(agent, { role: 'system', text: `✖ Weitergabe an ${pending.toName} verworfen.` });
    if (pending.chainId) bump('chains');
  }
  acknowledge(id);
  checkAchievements();
}

export function removeQueued(id, taskId) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  agent.queue = agent.queue.filter((t) => t.id !== taskId);
  saveState();
  pushUpdate(agent);
}

export function stop(id) {
  const ac = running.get(id);
  if (ac) ac.abort();
}

export function resetConversation(id) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  if (running.has(id)) throw fail(400, 'Agent arbeitet gerade – erst stoppen.');
  agent.messages = [];
  agent.sessionId = null;
  agent.unread = 0;
  agent.status = 'idle';
  addMessage(agent, { role: 'system', text: '🧹 Neue Session – das Gedächtnis wurde geleert.' });
  saveState();
  pushUpdate(agent);
}

export function acknowledge(id) {
  const agent = findAgent(id);
  if (!agent) return;
  agent.unread = 0;
  if (!running.has(id) && (agent.status === 'done' || agent.status === 'error')) agent.status = 'idle';
  saveState();
  pushUpdate(agent);
}

function pump() {
  const max = Math.max(1, Math.min(MAX_AGENTS, Number(settings.maxParallel) || MAX_AGENTS));
  const waiting = state.agents
    .filter((a) => a.queue.length && !running.has(a.id))
    .sort((a, b) => a.queue[0].ts - b.queue[0].ts);
  for (const agent of waiting) {
    if (running.size >= max) break;
    execute(agent);
  }
}

function reward(agent, text, durationMs) {
  const levelBefore = levelForXp(agent.xp);
  const coins = Math.round((15 + Math.min(60, Math.floor(text.length / 150)) + 2 * (levelBefore - 1)) * moraleFactor());
  const xp = 20 + Math.min(80, Math.floor(durationMs / 3000));
  agent.xp += xp;
  agent.questsDone += 1;
  agent.coinsEarned += coins;
  state.coins += coins;
  state.totalQuests += 1;
  state.totalCoinsEarned += coins;
  const levelAfter = levelForXp(agent.xp);
  return { coins, xp, levelUp: levelAfter > levelBefore ? levelAfter : null };
}

async function execute(agent) {
  const task = agent.queue.shift();
  if (!task) return;
  const provider = getProvider(agent.provider);
  const ac = new AbortController();
  running.set(agent.id, ac);
  const startedAt = Date.now();
  const l = { activity: '⏳ startet…', partial: '', startedAt, prompt: task.prompt, tools: 0 };
  live.set(agent.id, l);

  const history = agent.messages.slice();
  const project = findProject(task.projectId);
  const profile = findProfile(task.profileId);
  const reviewMode = Boolean(agent.review?.enabled && task.from);
  addMessage(agent, {
    role: 'user',
    text: task.prompt,
    meta: {
      projectId: project?.id || null,
      profileId: profile?.id || null,
      source: task.source,
      scheduleTitle: task.scheduleTitle,
      templateTitle: task.templateTitle,
      ...(task.from ? { from: task.from, instruction: task.instruction, resultStart: task.resultStart, chainId: task.chainId, step: task.step, round: task.round } : {}),
      ...(reviewMode ? { review: true } : {}),
    },
  });
  agent.status = 'working';
  saveState();
  pushUpdate(agent);
  pushGame();

  const onEvent = (ev) => {
    if (ev.type === 'delta') {
      l.partial += ev.text;
      if (l.partial.length > PREVIEW_CHARS * 2) l.partial = l.partial.slice(-PREVIEW_CHARS);
      emit('delta', { id: agent.id, text: ev.text });
    } else if (ev.type === 'activity') {
      l.activity = ev.text;
      if (ev.tool) l.tools += 1;
      emit('activity', { id: agent.id, text: ev.text, tools: l.tools });
    } else if (ev.type === 'session') {
      agent.sessionId = ev.id;
    } else if (ev.type === 'limits') {
      limitsCache.value = { provider: ev.provider, info: ev.info, ts: Date.now() };
      emit('limits', limitsCache.value);
    }
  };

  try {
    if (!provider) throw new Error('Unbekannter Provider: ' + agent.provider);
    const result = await provider.run({
      agent,
      prompt: (project ? projectPreamble(project) : '') + (profile ? profilePreamble(profile) : '') + task.prompt + (reviewMode ? REVIEW_SUFFIX : ''),
      persona: personaWithTalents(agent) + (!agent.projectId && project && agent.projectPrompts?.[project.id]
        ? `\n\nZusätzlich im Projekt „${project.name}“:\n${agent.projectPrompts[project.id]}` : ''),
      history,
      cwd: agentCwd(agent),
      extraDirs: project ? [projectFolder(project)] : [],
      signal: ac.signal,
      onEvent,
      settings,
    });
    const durationMs = Date.now() - startedAt;
    if (result.sessionId) agent.sessionId = result.sessionId;
    const text = result.text || '(keine Textantwort – siehe Arbeitsordner)';
    const r = reward(agent, text, durationMs);
    const score = reviewMode ? parseScore(text) : null;
    const msg = addMessage(agent, {
      role: 'assistant',
      text,
      meta: {
        provider: agent.provider, model: agent.model, durationMs, costUsd: result.costUsd, tools: l.tools,
        coins: r.coins, xp: r.xp, projectId: project?.id || null, chainId: task.chainId || null,
        profileId: profile?.id || null, structure: task.structure || null, planItemId: task.planItemId || null,
        ...(reviewMode ? { score, minScore: agent.review.minScore, round: task.round || 1 } : {}),
      },
    });
    agent.status = 'done';
    agent.unread += 1;
    archiveResult(agent, task, msg, project, durationMs, result.costUsd, score);
    bump('quests');
    if (new Date().getHours() < 5) bump('nightQuests');
    const talent = r.levelUp ? TALENTS.find((t) => t.level === r.levelUp) : null;
    emit('questDone', {
      id: agent.id, name: agent.name, avatar: agent.avatar, coins: r.coins, xp: r.xp,
      levelUp: r.levelUp, levelTitle: r.levelUp ? levelTitle(r.levelUp) : null,
      talent: talent ? `${talent.icon} ${talent.title}` : null,
    });
    if (reviewMode) handleReview(agent, task, msg, score);
    else if (task.returnTo) returnRevision(agent, task, msg);
    else relayResult(agent, task, msg);
    checkAchievements();
  } catch (err) {
    if (task.planItemId) clearPlanPending(task.planItemId);
    if (err.aborted || ac.signal.aborted) {
      addMessage(agent, { role: 'system', text: '⏹️ Auftrag abgebrochen.', meta: { partial: l.partial.slice(-PREVIEW_CHARS) } });
      agent.status = agent.unread ? 'done' : 'idle';
    } else {
      addMessage(agent, { role: 'error', text: err.message || String(err) });
      agent.status = 'error';
      agent.unread += 1;
      emit('toast', { kind: 'error', text: `${agent.avatar} ${agent.name}: Auftrag fehlgeschlagen.` });
    }
  } finally {
    running.delete(agent.id);
    live.delete(agent.id);
    if (findAgent(agent.id)) {
      if (agent.queue.length && agent.status !== 'error') agent.status = 'working';
      saveState();
      pushUpdate(agent);
    }
    pushGame();
    pump();
  }
}

// Prüfnote aus der Antwort lesen ("NOTE: 8/10", sonst letzte "x/10").
function parseScore(text) {
  const m = text.match(/NOTE\s*:?\s*\**\s*(\d+(?:[.,]\d+)?)\s*\/\s*10/i)
    || [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*\/\s*10/g)].pop();
  if (!m) return null;
  const v = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : null;
}

function archiveResult(agent, task, msg, project, durationMs, costUsd, score) {
  const entry = archive.addEntry({
    id: msg.id,
    ts: msg.ts,
    agentId: agent.id,
    agentName: agent.name,
    agentAvatar: agent.avatar,
    archetypeTitle: agent.archetypeTitle,
    projectId: project?.id || null,
    prompt: (task.from ? `${task.instruction} (Übergabe von ${task.from.name})` : task.prompt).slice(0, 4000),
    text: msg.text,
    provider: agent.provider,
    providerLabel: providerStatus[agent.provider]?.short || agent.provider,
    model: agent.model || '',
    durationMs,
    costUsd: typeof costUsd === 'number' ? costUsd : null,
    score,
    chainId: task.chainId || null,
    source: task.source || 'manual',
    profileId: task.profileId || null,
    structure: task.structure || null,
    limits: task.limits || null,
    planItemId: task.planItemId || null,
    status: 'offen',
  });
  if (project) saveResultFile(project, entry);
  if (task.planItemId) linkResult(task.planItemId, entry.id);
}

// Automatische Weitergabe nach erfolgreichem Auftrag (nur bei Erfolg, nie bei Fehler/Abbruch).
// Liefert true, wenn weitergegeben wurde oder eine Freigabe aussteht.
function relayResult(agent, task, msg, override = {}) {
  const relay = agent.relay;
  const target = relay?.toAgentId ? findAgent(relay.toAgentId) : null;
  if (relay?.toAgentId && !target) agent.relay = null;
  if (!target) {
    if (task.chainId) bump('chains');
    return false;
  }
  const step = (task.step || 0) + 1;
  if (step > MAX_CHAIN_STEPS) {
    addMessage(agent, { role: 'system', text: `🔗 Kette nach ${MAX_CHAIN_STEPS} Übergaben gestoppt (Schutz gegen Endlosschleifen).` });
    bump('chains');
    return false;
  }
  const payload = {
    toAgentId: target.id,
    instruction: relay.instruction,
    chainId: task.chainId || uid(),
    step,
    projectId: task.projectId ?? null,
    profileId: task.profileId ?? null,
    messageId: msg.id,
    ...(override.text ? { text: override.text } : {}),
  };
  if (relay.requireApproval) {
    agent.pendingRelay = { ...payload, toName: target.name, ts: Date.now() };
    addMessage(agent, { role: 'system', text: `⏸️ Wartet auf deine Freigabe: Weitergabe an ${target.avatar} ${target.name}.` });
    emit('toast', { kind: 'info', text: `⏸️ ${agent.name} wartet auf deine Freigabe (→ ${target.name})` });
    return true;
  }
  try {
    handoff(agent.id, payload);
  } catch (err) {
    addMessage(agent, { role: 'error', text: 'Automatische Weitergabe fehlgeschlagen: ' + err.message });
  }
  return true;
}

// Prüfer-Logik: Note ≥ Ziel → freigeben (und Kette fortsetzen), sonst zurück an den Absender.
function handleReview(agent, task, msg, score) {
  const { minScore, maxRounds } = agent.review;
  const round = task.round || 1;
  const sender = task.from ? findAgent(task.from.agentId) : null;
  if (score == null) {
    addMessage(agent, { role: 'system', text: '⚠️ Keine Prüfnote gefunden – bitte selbst entscheiden.' });
    return;
  }
  if (score >= minScore) {
    const bonus = APPROVAL_BONUS + (round === 1 ? FIRST_PASS_BONUS : 0);
    state.coins += bonus;
    state.totalCoinsEarned += bonus;
    if (round === 1) bump('firstPass');
    addMessage(agent, { role: 'system', text: `✅ Freigegeben mit Note ${score}/10 in Runde ${round}${round === 1 ? ' – erster Anlauf!' : ''} (+${bonus} 🪙)` });
    emit('toast', { kind: 'quest', text: `🧐 ${agent.name}: freigegeben mit ${score}/10${round === 1 ? ' im ersten Anlauf' : ` nach ${round} Runden`} (+${bonus} 🪙)` });
    const approved = task.resultStart ? task.prompt.slice(task.resultStart) : task.prompt;
    relayResult(agent, task, msg, { text: approved });
    return;
  }
  if (round >= maxRounds || !sender) {
    addMessage(agent, { role: 'system', text: `⚠️ Ziel ${minScore}/10 nach ${round} Runde(n) nicht erreicht (zuletzt ${score}/10) – bitte selbst entscheiden.` });
    archive.updateEntry(msg.id, { escalated: true });
    emit('toast', { kind: 'error', text: `🧐 ${agent.name}: Ziel nicht erreicht (${score}/10) – deine Entscheidung ist gefragt.` });
    if (task.chainId) bump('chains');
    return;
  }
  addMessage(agent, { role: 'system', text: `↩️ Note ${score}/10 – zurück an ${sender.name} zur Überarbeitung (Runde ${round + 1} von ${maxRounds}).` });
  handoff(agent.id, {
    toAgentId: sender.id,
    messageId: msg.id,
    instruction: `Überarbeite deinen letzten Text anhand dieser Kritik von ${agent.name} (Note ${score}/10, Ziel: mindestens ${minScore}/10). Liefere die vollständige überarbeitete Fassung ohne Kommentar zur Kritik.`,
    chainId: task.chainId,
    step: (task.step || 0) + 1,
    round: round + 1,
    returnTo: agent.id,
    projectId: task.projectId ?? null,
    profileId: task.profileId ?? null,
  });
}

// Überarbeitete Fassung automatisch zurück an den Prüfer.
function returnRevision(agent, task, msg) {
  const reviewer = findAgent(task.returnTo);
  if (!reviewer) return relayResult(agent, task, msg);
  handoff(agent.id, {
    toAgentId: reviewer.id,
    messageId: msg.id,
    instruction: `Überarbeitete Fassung (Runde ${task.round}) – bitte erneut prüfen.`,
    chainId: task.chainId,
    step: (task.step || 0) + 1,
    round: task.round,
    projectId: task.projectId ?? null,
    profileId: task.profileId ?? null,
  });
  return true;
}

// Beim Start: Aufträge, die beim letzten Beenden liefen, gelten als unterbrochen.
export function recoverOnBoot() {
  for (const agent of state.agents) {
    // Migration auf Teams: bestehende Agents werden Stammpersonal, Platz und Arbeitsordner bleiben.
    if (!agent.slots) {
      if (agent.projectId === undefined) agent.projectId = null;
      agent.slots = { _: Number.isInteger(agent.slot) ? agent.slot : 0 };
      if (!agent.workspaceDir) agent.workspaceDir = path.join(WORKSPACES_DIR, `${(Number.isInteger(agent.slot) ? agent.slot : 0) + 1}-${agent.id}`);
      delete agent.slot;
    }
    agent.projectPrompts ||= {};
    if (agent.status === 'working') {
      addMessage(agent, { role: 'system', text: '⚠️ Der Server wurde während eines Auftrags beendet – Auftrag unterbrochen.' });
      agent.status = agent.queue.length ? 'idle' : 'error';
    }
    agent.queue ||= [];
    agent.messages ||= [];
    // Gemini CLI ist für AI-Pro-Konten abgeschaltet → auf Antigravity umstellen.
    if (agent.provider === 'gemini-cli' && providerStatus['antigravity-cli']?.available) {
      agent.provider = 'antigravity-cli';
      agent.model = '';
      agent.sessionId = null;
      addMessage(agent, { role: 'system', text: '🔄 Antrieb auf Gemini via Antigravity umgestellt (die Gemini CLI wird für AI-Pro-Konten nicht mehr unterstützt).' });
    }
  }
  ensureSlots();
  saveState(true);
  pump();
}
