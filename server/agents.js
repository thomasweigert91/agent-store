// Agent-Manager: Rekrutieren, Aufträge (Queue), parallele Ausführung, Belohnungen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { state, settings, saveState, WORKSPACES_DIR } from './store.js';
import { emit } from './events.js';
import { CATALOG, randomName, levelForXp, levelTitle, xpBounds } from './catalog.js';
import { getProvider, providerStatus } from './providers/index.js';

export const MAX_AGENTS = 10;
const MAX_MESSAGES = 300;
const PREVIEW_CHARS = 4000;
const AUTONOMY = ['safe', 'edits', 'auto', 'full'];

const running = new Map(); // agentId -> AbortController
const live = new Map();    // agentId -> { activity, partial, startedAt, prompt, tools }
export const limitsCache = { value: null }; // letzte Abo-Auslastung (Claude)

const uid = () => crypto.randomBytes(5).toString('hex');

export function findAgent(id) {
  return state.agents.find((a) => a.id === id);
}

function workspaceFor(agent) {
  return path.join(WORKSPACES_DIR, `${agent.slot + 1}-${agent.id}`);
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

export function gameInfo() {
  return {
    coins: state.coins,
    totalQuests: state.totalQuests,
    totalCoinsEarned: state.totalCoinsEarned,
    agentCount: state.agents.length,
    working: running.size,
    maxAgents: MAX_AGENTS,
  };
}

function addMessage(agent, msg) {
  agent.messages.push({ id: uid(), ts: Date.now(), ...msg });
  if (agent.messages.length > MAX_MESSAGES) agent.messages.splice(0, agent.messages.length - MAX_MESSAGES);
}

function firstFreeSlot() {
  const used = new Set(state.agents.map((a) => a.slot));
  for (let i = 0; i < MAX_AGENTS; i++) if (!used.has(i)) return i;
  return -1;
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function recruit({ archetypeId, name, provider, model, slot }) {
  const arch = CATALOG.find((c) => c.id === archetypeId);
  if (!arch) throw fail(400, 'Unbekannte Agent-Klasse.');
  if (state.agents.length >= MAX_AGENTS) throw fail(400, `Maximal ${MAX_AGENTS} Agents – entlasse erst jemanden.`);
  if (state.coins < arch.cost) throw fail(400, `Nicht genug Münzen (${state.coins}/${arch.cost}). Erledige Aufträge, um Münzen zu verdienen.`);

  let targetSlot = Number.isInteger(slot) && slot >= 0 && slot < MAX_AGENTS && !state.agents.some((a) => a.slot === slot) ? slot : firstFreeSlot();
  const chosenProvider = getProvider(provider) ? provider : pickDefaultProvider(arch.provider);
  const agent = {
    id: uid(),
    slot: targetSlot,
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
  addMessage(agent, { role: 'system', text: `${agent.avatar} ${agent.name} (${arch.title}) ist deinem Team beigetreten!` });
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
  if (Number.isInteger(patch.slot) && patch.slot >= 0 && patch.slot < MAX_AGENTS && patch.slot !== agent.slot) {
    const other = state.agents.find((a) => a.slot === patch.slot);
    if (other) { other.slot = agent.slot; pushUpdate(other); }
    agent.slot = patch.slot;
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
  saveState();
  emit('agentRemoved', { id });
  pushGame();
  emit('toast', { kind: 'info', text: `${agent.avatar} ${agent.name} wurde entlassen${refund ? ` (+${refund} 🪙 Abfindung zurück)` : ''}.` });
}

export function enqueue(id, prompt) {
  const agent = findAgent(id);
  if (!agent) throw fail(404, 'Agent nicht gefunden.');
  const text = String(prompt || '').trim();
  if (!text) throw fail(400, 'Leerer Auftrag.');
  if (text.length > 100000) throw fail(400, 'Auftrag ist zu lang (max. 100.000 Zeichen).');
  agent.queue.push({ id: uid(), prompt: text, ts: Date.now() });
  saveState();
  pushUpdate(agent);
  pump();
  return agent;
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
  const coins = 15 + Math.min(60, Math.floor(text.length / 150)) + 2 * (levelBefore - 1);
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
  addMessage(agent, { role: 'user', text: task.prompt });
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
      prompt: task.prompt,
      persona: agent.persona,
      history,
      cwd: agentCwd(agent),
      signal: ac.signal,
      onEvent,
      settings,
    });
    const durationMs = Date.now() - startedAt;
    if (result.sessionId) agent.sessionId = result.sessionId;
    const text = result.text || '(keine Textantwort – siehe Arbeitsordner)';
    const r = reward(agent, text, durationMs);
    addMessage(agent, {
      role: 'assistant',
      text,
      meta: { provider: agent.provider, model: agent.model, durationMs, costUsd: result.costUsd, tools: l.tools, coins: r.coins, xp: r.xp },
    });
    agent.status = 'done';
    agent.unread += 1;
    emit('questDone', { id: agent.id, name: agent.name, avatar: agent.avatar, coins: r.coins, xp: r.xp, levelUp: r.levelUp, levelTitle: r.levelUp ? levelTitle(r.levelUp) : null });
  } catch (err) {
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

// Beim Start: Aufträge, die beim letzten Beenden liefen, gelten als unterbrochen.
export function recoverOnBoot() {
  for (const agent of state.agents) {
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
  saveState(true);
  pump();
}
