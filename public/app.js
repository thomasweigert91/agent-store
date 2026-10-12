import { renderMarkdown } from './markdown.js';
import { initPanels } from './panels.js';
import { registerScene, autoScale, lookFor, randomLook, PORTRAIT, HAIR_STYLES, HAIR_COLORS, SKINS, ACCESSORIES } from './pixel.js';

// ---------------------------------------------------------------- State & helpers
const S = {
  game: {},
  agents: new Map(),
  catalog: [],
  avatars: [],
  providers: {},
  settings: {},
  limits: null,
  openId: null,
  tab: 'chat',
  detail: null,
  storeProvider: 'auto',
  storeTab: 'agents',
  projects: [],
  projectIcons: [],
  upgradeCatalog: [],
  talentCatalog: [],
  profiles: [],
  templateCategories: [],
  planTypes: [],
  storeSlot: null,
  online: false,
};
const MAX = 10;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Agent-Store': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const AUTONOMY = {
  safe: { label: '🔒 Sicher – liest & antwortet, Dateien speichert der Agent Store', short: null },
  edits: { label: '✏️ Darf Dateien im Arbeitsordner bearbeiten', short: '✏️ Edits' },
  auto: { label: '🤖 Auto – Agent entscheidet selbst (Claude)', short: '🤖 Auto' },
  full: { label: '⚠️ Volle Kontrolle – auch Shell-Befehle', short: '⚠️ Voll' },
};
const RARITY = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };

function providerShort(a) {
  const p = S.providers[a.provider];
  const name = p?.short || a.provider;
  return a.model ? `${name} · ${a.model}` : name;
}

const PROVIDER_ORDER = ['claude-cli', 'antigravity-cli', 'claude-api', 'gemini-api', 'demo', 'gemini-cli'];
function providerList() {
  return PROVIDER_ORDER.map((id) => S.providers[id]).filter(Boolean);
}

function uiStatus(a) {
  if (a.running) return 'working';
  if (a.status === 'done' || a.status === 'error') return a.status;
  return 'idle';
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')} min` : `${s}s`;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------- Sound
let actx = null;
function sound(kind) {
  if (!S.settings.sound) return;
  try {
    actx ||= new AudioContext();
    const seq = {
      quest: [[660, 0, 0.09], [880, 0.09, 0.14]],
      level: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25]],
      recruit: [[392, 0, 0.08], [523, 0.08, 0.12]],
      error: [[220, 0, 0.18], [180, 0.16, 0.2]],
    }[kind] || [];
    const now = actx.currentTime;
    for (const [f, t, d] of seq) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.05, now + t);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      o.connect(g).connect(actx.destination);
      o.start(now + t);
      o.stop(now + t + d + 0.02);
    }
  } catch { /* kein Audio */ }
}

// ---------------------------------------------------------------- Toasts & ticker
function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

function ticker(text) {
  $('#ticker-text').textContent = `${fmtTime(Date.now())} · ${text}`;
}

// ---------------------------------------------------------------- HUD
let lastCoins = null;
function renderStats() {
  const g = S.game;
  const coinsEl = $('#stat-coins');
  coinsEl.textContent = g.coins ?? 0;
  if (lastCoins !== null && g.coins > lastCoins) {
    coinsEl.parentElement.classList.remove('bump');
    void coinsEl.parentElement.offsetWidth;
    coinsEl.parentElement.classList.add('bump');
  }
  lastCoins = g.coins;
  $('#stat-agents').textContent = `${g.agentCount ?? 0}/${g.maxAgents ?? MAX}`;
  $('#stat-working').textContent = g.workingElsewhere ? `${g.working - g.workingElsewhere}+${g.workingElsewhere}` : (g.working ?? 0);
  $('#stat-working').parentElement.title = g.workingElsewhere
    ? `${g.working - g.workingElsewhere} arbeiten in diesem Büro, ${g.workingElsewhere} in anderen Projekten`
    : 'Agents, die gerade arbeiten';
  $('#stat-quests').textContent = g.totalQuests ?? 0;
  $('#stat-morale').textContent = `${Math.round((g.morale || 1) * 100)}%`;
  renderInboxBadge(g.inboxCount);
  $('#welcome').hidden = (g.agentCount ?? 0) > 0;
  renderProjectPicker();
}

function renderInboxBadge(count) {
  const b = $('#inbox-badge');
  if (!b) return;
  b.hidden = !(count > 0);
  b.textContent = count > 99 ? '99+' : String(count || 0);
}

function renderProjectPicker() {
  const sel = $('#active-project');
  if (!sel || !panels) return;
  sel.innerHTML = panels.projectOptions(S.game.activeProjectId, { none: 'Kein Projekt' }) + '<option value="__new">＋ Neues Projekt…</option>';
  sel.value = S.game.activeProjectId || '';
  const p = S.projects.find((x) => x.id === S.game.activeProjectId);
  sel.parentElement.classList.toggle('active', Boolean(p));
  sel.parentElement.style.setProperty('--pc', p?.color || 'var(--line2)');
}

function projectChip(id) {
  const p = S.projects.find((x) => x.id === id);
  return p ? `<span class="chip proj" style="--pc:${esc(p.color)}">${esc(p.icon)} ${esc(p.name)}</span>` : '';
}

function renderProviders() {
  const order = ['claude-cli', 'antigravity-cli', 'claude-api', 'gemini-api'];
  $('#providers').innerHTML = order
    .filter((id) => S.providers[id])
    .map((id) => {
      const p = S.providers[id];
      const tip = p.available ? `${p.label} – ${p.version || 'bereit'}` : `${p.label} – ${p.hint || 'nicht verfügbar'}`;
      return `<span class="pill ${p.available ? 'on' : 'off'}" title="${esc(tip)}">${esc(p.short)}</span>`;
    })
    .join('');
}

function renderEnergy() {
  const info = S.limits?.info;
  const box = $('#energy');
  const windows = info?.unifiedWindows;
  if (!windows || !Object.keys(windows).length) { box.hidden = true; return; }
  const names = { five_hour: '5 Std', seven_day: '7 Tage', seven_day_opus: '7T Opus', seven_day_sonnet: '7T Sonnet' };
  box.hidden = false;
  $('#energy-bars').innerHTML = Object.entries(windows)
    .slice(0, 3)
    .map(([k, w]) => {
      const pct = Math.round(Math.min(1, Math.max(0, Number(w.utilization) || 0)) * 100);
      const reset = w.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="ebar" title="${esc(names[k] || k)}: ${pct}% genutzt${reset ? ' · Reset ' + esc(reset) : ''}"><span>${esc(names[k] || k)} ${pct}%</span><div class="ebar-track"><div class="ebar-fill" style="width:${pct}%"></div></div></div>`;
    })
    .join('');
}

// ---------------------------------------------------------------- Floor (Schreibtische)
const desks = []; // index = slot -> { el, agentId, refs }

function initFloor() {
  const floor = $('#floor');
  floor.innerHTML = '';
  for (let i = 0; i < MAX; i++) {
    const holder = document.createElement('div');
    holder.style.display = 'contents';
    floor.append(holder);
    desks[i] = { holder, agentId: undefined, refs: null };
  }
}

function agentInSlot(slot) {
  for (const a of S.agents.values()) if (a.inView && a.slot === slot) return a;
  return null;
}

// Agents im aktuell angezeigten Büro (Projekt-Team + Stammpersonal), nach Platz sortiert
function viewAgents() {
  return [...S.agents.values()].filter((a) => a.inView).sort((x, y) => x.slot - y.slot);
}

function teamLabel(a) {
  if (!a.projectId) return '👥 Stammpersonal';
  const p = S.projects.find((x) => x.id === a.projectId);
  return p ? `${p.icon} ${p.name}` : 'Projekt';
}

function renderFloor() {
  for (let slot = 0; slot < MAX; slot++) {
    const a = agentInSlot(slot);
    const d = desks[slot];
    const id = a ? a.id : null;
    if (d.agentId !== id) {
      d.holder.innerHTML = '';
      d.agentId = id;
      if (a) {
        d.refs = buildDesk(a);
        d.holder.append(d.refs.el);
      } else {
        d.refs = null;
        d.holder.append(buildEmptyDesk(slot));
      }
    }
    if (a) updateDesk(a);
  }
}

// Freier Platz: gleicher Aufbau wie ein besetzter Schreibtisch, damit alle Karten gleich groß sind.
function buildEmptyDesk(slot) {
  const el = document.createElement('article');
  el.className = 'desk empty';
  el.innerHTML = `
    <div class="desk-top"><span class="slot-no">#${slot + 1}</span><span class="chip">frei</span></div>
    <div class="scene-wrap"><canvas class="scene"></canvas><span class="plus">＋</span></div>
    <div class="who">
      <div class="name">Platz ${slot + 1}</div>
      <div class="role-row"><span class="cls">Noch niemand angestellt</span></div>
      <div class="purpose">&nbsp;</div>
      <div class="xp"><div class="xp-fill"></div></div>
    </div>
    <div class="statusbar">
      <div class="status-row"><span class="state"><i class="dot"></i><b class="state-label">FREI</b></span></div>
      <div class="detail">Klick, um einen Agent zu rekrutieren</div>
    </div>
    <div class="quick"><button class="btn btn-sm hire" type="button">🛒 Agent rekrutieren</button></div>`;
  registerScene($('canvas.scene', el), () => ({ id: 'empty-' + slot, empty: true }));
  autoScale($('.scene-wrap', el));
  el.addEventListener('click', () => openStore(slot));
  return el;
}

// Zustand für Anzeige und Animation: arbeitet, überlegt, braucht Rückmeldung …
const THINKING_RE = /denkt|startet|Session|liest|sammelt|sortiert|Anfrage|bereit|♻️/i;
function phaseOf(a) {
  if (!a) return 'idle';
  if (a.running) return THINKING_RE.test(a.live?.activity || '⏳ startet') ? 'thinking' : 'working';
  if (a.status === 'error') return 'error';
  if (a.status === 'done' || a.unread > 0) return 'feedback';
  if (a.queue?.length) return 'waiting';
  return 'idle';
}

const PHASES = {
  idle: { label: 'BEREIT', detail: () => 'Bereit für Aufträge' },
  waiting: { label: 'WARTET', detail: (a) => `Wartet auf freien Platz (${a.queue.length} in Warteschlange)` },
  thinking: { label: 'ÜBERLEGT', detail: (a) => a.live?.activity || 'denkt nach…' },
  working: { label: 'ARBEITET', detail: (a) => a.live?.activity || 'arbeitet…' },
  feedback: { label: 'RÜCKMELDUNG', detail: (a) => (a.pendingRelay ? `⏸️ Freigabe nötig → ${a.pendingRelay.toName}` : 'Ergebnis fertig – klick zum Ansehen') },
  error: { label: 'PROBLEM', detail: () => 'Fehler – klick für Details' },
};

function sceneInput(a) {
  return a ? { id: a.id, look: lookFor(a), color: a.color, phase: phaseOf(a), upgrades: S.game.upgrades || [], nextShift: a.nextShift } : null;
}

function buildDesk(a) {
  const el = document.createElement('article');
  el.className = 'desk';
  el.innerHTML = `
    <div class="desk-top">
      <span class="slot-no"></span>
      <span class="chip prov"></span>
      <span class="chip autonomy" hidden></span>
      <span class="chip team" hidden title="Stammpersonal – arbeitet in allen Projekten">👥</span>
      <span class="chip relay" hidden></span>
      <span class="chip shift" hidden></span>
      <span class="badge-unread" hidden>!</span>
    </div>
    <div class="scene-wrap"><canvas class="scene"></canvas><span class="lvl"></span><span class="sym"></span></div>
    <div class="who">
      <div class="name"></div>
      <div class="role-row"><span class="role"></span><span class="cls"></span></div>
      <div class="purpose"></div>
      <div class="xp"><div class="xp-fill"></div></div>
    </div>
    <div class="statusbar">
      <div class="status-row">
        <span class="state"><i class="dot"></i><b class="state-label"></b></span>
        <span class="spacer"></span>
        <span class="queue"></span>
        <span class="timer"></span>
        <button class="stop" hidden title="Auftrag abbrechen">⏹</button>
      </div>
      <div class="detail"></div>
    </div>
    <form class="quick" autocomplete="off">
      <input name="prompt" placeholder="Auftrag geben… (Enter)" maxlength="100000">
      <button class="btn btn-sm btn-gold" type="submit" title="Auftrag senden">➤</button>
    </form>`;
  const refs = {
    el,
    slotNo: $('.slot-no', el),
    prov: $('.chip.prov', el),
    autonomy: $('.chip.autonomy', el),
    relay: $('.chip.relay', el),
    team: $('.chip.team', el),
    shift: $('.chip.shift', el),
    unread: $('.badge-unread', el),
    lvl: $('.scene-wrap .lvl', el),
    sym: $('.scene-wrap .sym', el),
    name: $('.name', el),
    cls: $('.cls', el),
    role: $('.role', el),
    purpose: $('.purpose', el),
    xpFill: $('.xp-fill', el),
    stateLabel: $('.state-label', el),
    detail: $('.detail', el),
    timer: $('.timer', el),
    queue: $('.queue', el),
    stop: $('.stop', el),
    form: $('.quick', el),
    input: $('.quick input', el),
  };
  const id = a.id;
  registerScene($('canvas.scene', el), () => sceneInput(S.agents.get(id)));
  autoScale($('.scene-wrap', el));
  el.addEventListener('click', (e) => {
    if (e.target.closest('.quick, .stop')) return;
    openDrawer(id);
  });
  refs.stop.addEventListener('click', () => api('POST', `/api/agents/${id}/stop`).catch((e) => toast(e.message, 'error')));
  refs.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = refs.input.value.trim();
    if (!prompt) return;
    refs.input.value = '';
    try {
      await api('POST', `/api/agents/${id}/tasks`, { prompt });
    } catch (err) {
      refs.input.value = prompt;
      toast(err.message, 'error');
    }
  });
  return refs;
}

function updateDesk(a) {
  if (!a.inView || a.slot == null) return;
  const d = desks[a.slot];
  if (!d?.refs || d.agentId !== a.id) return;
  const r = d.refs;
  const st = uiStatus(a);
  const phase = phaseOf(a);
  r.el.className = `desk status-${st} phase-${phase}${S.openId === a.id ? ' selected' : ''}`;
  r.el.style.setProperty('--c', a.color || '#7dd3fc');
  r.slotNo.textContent = `#${a.slot + 1}`;
  r.prov.className = `chip prov p-${a.provider}`;
  r.prov.textContent = providerShort(a);
  r.prov.title = S.providers[a.provider]?.label || a.provider;
  const au = AUTONOMY[a.autonomy]?.short;
  r.autonomy.hidden = !au || !a.provider.endsWith('-cli');
  r.autonomy.textContent = au || '';
  r.team.hidden = Boolean(a.projectId) || !S.game.activeProjectId;
  const relayTo = a.relay?.toAgentId ? S.agents.get(a.relay.toAgentId) : null;
  r.relay.hidden = !relayTo;
  r.relay.textContent = relayTo ? `🔗 → ${relayTo.name}` : '';
  r.relay.title = relayTo ? `Ergebnisse gehen automatisch an ${relayTo.name}${a.relay.instruction ? ': ' + a.relay.instruction : ''}${a.relay.requireApproval ? ' (nach deiner Freigabe)' : ''}` : '';
  if (relayTo && a.relay.requireApproval) r.relay.textContent += ' ⏸️';
  if (a.review?.enabled) { r.relay.hidden = false; r.relay.textContent = `🧐 ≥${a.review.minScore}${relayTo ? ` · → ${relayTo.name}` : ''}`; r.relay.title = `Prüfer-Modus: gibt ab Note ${a.review.minScore}/10 frei, max. ${a.review.maxRounds} Runden` + (relayTo ? `, danach weiter an ${relayTo.name}` : ''); }
  r.shift.hidden = !a.nextShift;
  if (a.nextShift) {
    const d = new Date(a.nextShift.at);
    const today = d.toDateString() === new Date().toDateString();
    r.shift.textContent = `🗓️ ${today ? '' : d.toLocaleDateString('de-DE', { weekday: 'short' }) + ' '}${a.nextShift.time}`;
    r.shift.title = `Nächste Schicht: ${a.nextShift.title}`;
  }
  r.unread.hidden = !(a.unread > 1) || a.running;
  r.unread.textContent = a.unread;
  r.unread.title = `${a.unread} ungelesene Ergebnisse`;
  r.lvl.textContent = `LV ${a.level}`;
  r.sym.textContent = a.avatar;
  r.name.textContent = a.name;
  r.role.textContent = `${a.avatar} ${a.archetypeTitle}`;
  r.cls.textContent = `${a.levelTitle} · ${a.questsDone} ✔`;
  const purpose = a.archetypeBlurb || '';
  r.purpose.textContent = purpose;
  r.purpose.title = a.archetypeBlurb || '';
  const pct = Math.round(((a.xp - a.xpFrom) / Math.max(1, a.xpTo - a.xpFrom)) * 100);
  r.xpFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  r.xpFill.parentElement.title = `${a.xp} / ${a.xpTo} XP bis Level ${a.level + 1}`;

  const ph = PHASES[phase];
  r.stateLabel.textContent = ph.label;
  const detail = ph.detail(a);
  r.detail.textContent = detail;
  r.detail.title = detail;
  r.queue.textContent = a.queue.length && phase !== 'waiting' ? `📋 ${a.queue.length}` : '';
  r.queue.title = a.queue.length ? `${a.queue.length} Aufträge in der Warteschlange` : '';
  r.stop.hidden = !a.running;
  updateTimer(a);
}

function updateTimer(a) {
  const r = desks[a.slot]?.refs;
  if (!r) return;
  r.timer.textContent = a.running && a.live?.startedAt ? `⏱ ${fmtDuration(Date.now() - a.live.startedAt)}` : '';
}

setInterval(() => {
  for (const a of S.agents.values()) if (a.running) updateTimer(a);
  if (S.openId) {
    const a = S.agents.get(S.openId);
    const el = $('#live-timer');
    if (a?.running && el && a.live?.startedAt) el.textContent = fmtDuration(Date.now() - a.live.startedAt);
  }
}, 1000);

function popCoins(a, coins, xp) {
  const r = desks[a.slot]?.refs;
  if (!r) return;
  r.el.classList.remove('flash');
  void r.el.offsetWidth;
  r.el.classList.add('flash');
  const pop = document.createElement('div');
  pop.className = 'coin-pop';
  pop.textContent = `+${coins} 🪙  +${xp} XP`;
  pop.style.left = '50%';
  pop.style.top = '40%';
  pop.style.transform = 'translateX(-50%)';
  r.el.append(pop);
  setTimeout(() => pop.remove(), 1500);
}

// ---------------------------------------------------------------- Drawer (Agent-Detail)
async function openDrawer(id, tab = 'chat') {
  const a = S.agents.get(id);
  if (!a) return;
  const prev = S.openId;
  S.openId = id;
  S.tab = tab;
  S.detail = null;
  if (prev && S.agents.get(prev)) updateDesk(S.agents.get(prev));
  updateDesk(a);
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('on');
  renderDrawer();
  await loadDetail();
  if (a.unread > 0 || a.status === 'done' || a.status === 'error') api('POST', `/api/agents/${id}/ack`).catch(() => {});
}

function closeDrawer() {
  const prev = S.openId;
  S.openId = null;
  S.detail = null;
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  if (!$('#modal').classList.contains('open')) $('#scrim').classList.remove('on');
  if (prev && S.agents.get(prev)) updateDesk(S.agents.get(prev));
}

async function loadDetail() {
  const id = S.openId;
  if (!id) return;
  try {
    const d = await api('GET', `/api/agents/${id}`);
    if (S.openId !== id) return;
    S.detail = d;
    if (S.tab === 'chat') renderChat();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderDrawer() {
  const a = S.agents.get(S.openId);
  if (!a) return closeDrawer();
  const inner = $('#drawer-inner');
  inner.style.setProperty('--c', a.color);
  inner.innerHTML = `
    <div class="dr-head" style="--c:${esc(a.color)}">
      <div class="avatar portrait"><canvas id="dr-portrait"></canvas><span class="lvl">LV ${a.level}</span></div>
      <div class="dr-title">
        <h2>${esc(a.name)} <span class="chip p-${esc(a.provider)}">${esc(providerShort(a))}</span></h2>
        <div class="sub">${esc(a.archetypeTitle)} · ${esc(a.levelTitle)} · ${a.questsDone} Aufträge · ${a.coinsEarned} 🪙 verdient</div>
        <div class="xp" title="${a.xp} / ${a.xpTo} XP"><div class="xp-fill" style="width:${Math.min(100, Math.round(((a.xp - a.xpFrom) / Math.max(1, a.xpTo - a.xpFrom)) * 100))}%"></div></div>
      </div>
      <button class="btn btn-ghost btn-icon" id="dr-close" title="Schließen (Esc)">✕</button>
    </div>
    <div class="tabs">
      <button class="tab ${S.tab === 'chat' ? 'active' : ''}" data-tab="chat">💬 Aufträge</button>
      <button class="tab ${S.tab === 'gear' ? 'active' : ''}" data-tab="gear">⚙️ Ausrüstung</button>
    </div>
    <div class="dr-body" id="dr-body"></div>
    <div class="dr-foot" id="dr-foot"></div>`;
  const portraitId = a.id;
  registerScene($('#dr-portrait'), () => sceneInput(S.agents.get(portraitId)), { crop: PORTRAIT });
  $('#dr-close').onclick = closeDrawer;
  inner.querySelectorAll('.tab').forEach((t) => (t.onclick = () => { S.tab = t.dataset.tab; renderDrawer(); }));
  if (S.tab === 'chat') renderChat(); else renderGear();
}

function messageHtml(m) {
  if (m.role === 'user' && m.meta?.from) {
    const f = m.meta.from;
    const start = Number(m.meta.resultStart) || 0;
    const result = start ? m.text.slice(start) : m.text;
    const chain = m.meta.step > 1 ? ` · 🔗 Kettenschritt ${m.meta.step}` : '';
    return `<div class="msg user handoff">
      <div class="handoff-from">📨 von ${esc(f.title)} ${esc(f.avatar)} ${esc(f.name)}${chain}</div>
      <div class="bubble">${esc(m.meta.instruction || '')}
        <details><summary>Ergebnis von ${esc(f.name)} anzeigen</summary><div class="handoff-result">${renderMarkdown(result)}</div></details>
      </div>
      <div class="meta">${m.meta.round > 1 ? `<span class="chip">Runde ${m.meta.round}</span>` : ''}${projectChip(m.meta.projectId)}${fmtTime(m.ts)}</div></div>`;
  }
  if (m.role === 'user') {
    const tags = [
      m.meta?.templateTitle ? `<span class="chip">📜 ${esc(m.meta.templateTitle)}</span>` : '',
      m.meta?.scheduleTitle ? `<span class="chip">🗓️ ${esc(m.meta.scheduleTitle)}</span>` : '',
      m.meta?.source === 'broadcast' ? '<span class="chip">📢 Massenauftrag</span>' : '',
      projectChip(m.meta?.projectId),
    ].join('');
    return `<div class="msg user"><div class="bubble">${esc(m.text)}</div><div class="meta">${tags}${fmtTime(m.ts)}</div></div>`;
  }
  if (m.role === 'assistant') {
    const meta = m.meta || {};
    const bits = [fmtTime(m.ts)];
    if (meta.durationMs) bits.push(`⏱ ${fmtDuration(meta.durationMs)}`);
    if (meta.tools) bits.push(`🔧 ${meta.tools}`);
    if (meta.model) bits.push(esc(meta.model));
    const reward = (meta.coins ? `<span class="reward">+${meta.coins} 🪙 +${meta.xp} XP</span>` : '')
      + (typeof meta.score === 'number' ? `<span class="chip score ${meta.score >= meta.minScore ? 'ok' : 'bad'}">🧐 ${meta.score}/10 ${meta.score >= meta.minScore ? '✅' : '↩️'}</span>` : '')
      + projectChip(meta.projectId);
    return `<div class="msg assistant" data-mid="${esc(m.id)}"><div class="bubble">${renderMarkdown(m.text)}</div><div class="meta">${bits.join(' · ')} ${reward}<button class="copy-msg" data-copy-mid="${esc(m.id)}">📋 kopieren</button><button class="copy-msg handoff-btn" data-handoff-mid="${esc(m.id)}">➡️ Weitergeben an …</button><button class="copy-msg convert-btn" data-convert-mid="${esc(m.id)}">♻️ Umwandeln</button></div></div>`;
  }
  if (m.role === 'error') {
    const denied = /Verweigert:|permission/i.test(m.text);
    return `<div class="msg error"><div class="bubble">❌ ${esc(m.text)}</div><div class="meta">${fmtTime(m.ts)}
      <button class="copy-msg retry-btn" data-retry-mid="${esc(m.id)}">🔁 Erneut versuchen</button>
      ${denied ? `<button class="copy-msg retry-btn" data-retry-mid="${esc(m.id)}" data-unlock="1" title="Setzt die Autonomie auf „Volle Kontrolle“ (auch Shell-Befehle)">🔓 Befehle erlauben & erneut</button>` : ''}</div></div>`;
  }
  return `<div class="msg system"><div class="bubble">${esc(m.text)}</div></div>`;
}

function renderChat() {
  const a = S.agents.get(S.openId);
  const body = $('#dr-body');
  const foot = $('#dr-foot');
  if (!a || !body || S.tab !== 'chat') return;
  const msgs = S.detail?.messages;
  if (!msgs) {
    body.innerHTML = '<div class="msg system"><div class="bubble">lädt…</div></div>';
  } else {
    const live = a.running
      ? `<div class="msg assistant live" id="live-msg">
           <div class="live-activity"><span class="spinner"></span><span id="live-activity">${esc(a.live?.activity || 'arbeitet…')}</span><span id="live-timer" style="margin-left:auto;font-family:var(--mono)"></span></div>
           <div class="bubble" id="live-bubble">${a.live?.partial ? renderMarkdown(a.live.partial) : '<span style="color:var(--dim)">…</span>'}</div>
         </div>`
      : '';
    const empty = msgs.length ? '' : '<div class="msg system"><div class="bubble">Noch keine Aufträge. Schreib unten, was zu tun ist!</div></div>';
    body.innerHTML = empty + msgs.map(messageHtml).join('') + live;
    body.scrollTop = body.scrollHeight;
  }

  foot.innerHTML = `
    ${a.queue.length ? `<div class="queue-list">${a.queue.map((t, i) => `<div class="queue-item">📋 <span title="${esc(t.prompt)}">${i + 1}. ${esc(t.prompt)}</span><button class="btn btn-sm btn-ghost" data-unqueue="${esc(t.id)}" title="Aus Warteschlange entfernen">✕</button></div>`).join('')}</div>` : ''}
    ${a.pendingRelay ? `<div class="approval-banner">
      <span>⏸️ Ergebnis wartet auf deine Freigabe – Weitergabe an <b>${esc(a.pendingRelay.toName)}</b></span>
      <button type="button" class="btn btn-sm btn-gold" id="relay-yes">✅ Freigeben</button>
      <button type="button" class="btn btn-sm" id="relay-no">✖ Nicht weitergeben</button>
    </div>` : ''}
    <form class="composer" id="composer">
      <textarea id="composer-text" placeholder="Neuer Auftrag an ${esc(a.name)}… (Strg+Enter zum Senden)"></textarea>
      <div class="composer-row opts">
        <select id="composer-project" class="mini-select" title="Projekt für diesen Auftrag">${panels.projectOptions(a.projectId || S.game.activeProjectId, { none: '📄 Kein Projekt' })}</select>
        ${S.profiles.length ? `<select id="composer-profile" class="mini-select" title="Kontext-Profil für diesen Auftrag">${panels.profileOptions(null, { none: '🏢 Kein Profil', projectDefault: true })}</select>` : ''}
        <span class="hint">${a.running ? 'Arbeitet gerade – neue Aufträge landen in der Warteschlange.' : '<span class="kbd">Strg</span>+<span class="kbd">Enter</span> senden'}</span>
      </div>
      <div class="composer-row actions">
        <button type="button" class="btn btn-sm btn-ghost" id="btn-folder" title="Arbeitsordner öffnen">📂 Ordner</button>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-reset" title="Gedächtnis leeren und neue Session starten">🧹 Neue Session</button>
        <span class="spacer"></span>
        ${a.running ? '<button type="button" class="btn btn-sm btn-danger" id="btn-stop">⏹ Stop</button>' : ''}
        <button type="submit" class="btn btn-gold">➤ Beauftragen</button>
      </div>
    </form>`;
  const ta = $('#composer-text');
  ta.value = S.draft?.[a.id] || '';
  ta.addEventListener('input', () => { (S.draft ||= {})[a.id] = ta.value; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = ta.value.trim();
    if (!prompt) return;
    try {
      await api('POST', `/api/agents/${a.id}/tasks`, {
        prompt,
        projectId: $('#composer-project').value || null,
        ...($('#composer-profile') ? { profileId: panels.profileParam($('#composer-profile').value) } : {}),
      });
      ta.value = '';
      if (S.draft) delete S.draft[a.id];
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#btn-folder').onclick = () => api('POST', `/api/agents/${a.id}/open-folder`).catch((e) => toast(e.message, 'error'));
  const decide = (approve) => api('POST', `/api/agents/${a.id}/relay-decision`, { approve }).catch((e) => toast(e.message, 'error'));
  if ($('#relay-yes')) { $('#relay-yes').onclick = () => decide(true); $('#relay-no').onclick = () => decide(false); }
  $('#btn-reset').onclick = async () => {
    if (!confirm(`Gedächtnis von ${a.name} leeren und neue Session starten?`)) return;
    try { await api('POST', `/api/agents/${a.id}/reset`); await loadDetail(); } catch (e) { toast(e.message, 'error'); }
  };
  const stopBtn = $('#btn-stop');
  if (stopBtn) stopBtn.onclick = () => api('POST', `/api/agents/${a.id}/stop`).catch((e) => toast(e.message, 'error'));
  foot.querySelectorAll('[data-unqueue]').forEach((b) => (b.onclick = () => api('DELETE', `/api/agents/${a.id}/tasks/${b.dataset.unqueue}`).catch((e) => toast(e.message, 'error'))));
  if (document.activeElement === document.body) ta.focus();
}

let liveRenderPending = false;
function scheduleLiveRender() {
  if (liveRenderPending) return;
  liveRenderPending = true;
  requestAnimationFrame(() => {
    liveRenderPending = false;
    const a = S.agents.get(S.openId);
    const bubble = $('#live-bubble');
    if (!a || !bubble) return;
    const body = $('#dr-body');
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 120;
    bubble.innerHTML = renderMarkdown(a.live?.partial || '');
    if (nearBottom) body.scrollTop = body.scrollHeight;
  });
}

function renderGear() {
  const a = S.agents.get(S.openId);
  const body = $('#dr-body');
  const foot = $('#dr-foot');
  if (!a) return;
  const p = S.providers[a.provider] || {};
  const provOptions = providerList()
    .map((x) => `<option value="${esc(x.id)}" ${x.id === a.provider ? 'selected' : ''}>${x.available ? '' : '⛔ '}${esc(x.label)}${x.available ? '' : ' (nicht verfügbar)'}</option>`)
    .join('');
  body.innerHTML = `
    <form class="form" id="gear-form" autocomplete="off">
      <div class="row2">
        <div class="field"><label>Name</label><input name="name" value="${esc(a.name)}" maxlength="24"></div>
        <div class="field"><label>Zugehörigkeit</label><select name="team">
          <option value="" ${!a.projectId ? 'selected' : ''}>👥 Stammpersonal (alle Projekte)</option>
          ${S.projects.map((p) => `<option value="${esc(p.id)}" ${a.projectId === p.id ? 'selected' : ''}>${esc(p.icon)} Nur „${esc(p.name)}“</option>`).join('')}
        </select></div>
        <div class="field"><label>Platz (in diesem Büro)</label><select name="slot">${Array.from({ length: MAX }, (_, i) => `<option value="${i}" ${i === a.slot ? 'selected' : ''}>Schreibtisch ${i + 1}</option>`).join('')}</select></div>
      </div>
      <div class="field">
        <label>Aussehen</label>
        <div class="look-editor">
          <div class="look-preview"><canvas id="look-preview"></canvas></div>
          <div class="look-fields">
            <div class="row2">
              <div><div class="mini-label">Frisur</div><select id="look-hair">${HAIR_STYLES.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div>
              <div><div class="mini-label">Accessoire</div><select id="look-acc">${ACCESSORIES.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div>
            </div>
            <div class="mini-label">Haarfarbe</div>
            <div class="swatches" id="look-hairColor">${HAIR_COLORS.map((c, i) => `<button type="button" data-i="${i}" style="background:${c}" title="Haarfarbe ${i + 1}"></button>`).join('')}</div>
            <div class="mini-label">Hautton</div>
            <div class="swatches" id="look-skin">${SKINS.map((c, i) => `<button type="button" data-i="${i}" style="background:${c}" title="Hautton ${i + 1}"></button>`).join('')}</div>
            <button type="button" class="btn btn-sm" id="look-random">🎲 Zufällig</button>
          </div>
        </div>
        <div class="help">Die Shirtfarbe ist die Farbe der Agent-Klasse.</div>
      </div>
      <div class="field"><label>Symbol (für Meldungen)</label><div class="avatar-grid" id="avatar-grid">${S.avatars.map((e) => `<button type="button" class="${e === a.avatar ? 'on' : ''}" data-av="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>
      <div class="row2">
        <div class="field">
          <label>Antrieb (KI-Anbieter)</label>
          <select name="provider" id="gear-provider">${provOptions}</select>
          <div class="help" id="prov-help">${esc(p.available ? (p.version || 'bereit') : (p.hint || ''))}</div>
        </div>
        <div class="field">
          <label>Modell</label>
          <input name="model" id="gear-model" list="model-list" value="${esc(a.model)}" placeholder="leer = Standard des Anbieters">
          <datalist id="model-list">${(p.modelSuggestions || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
          <div class="help">Claude-Abo: <code>sonnet</code>, <code>opus</code>, <code>haiku</code> · Gemini-Abo: z. B. <code>gemini-3.1-pro-high</code> (Vorschläge im Feld)</div>
        </div>
      </div>
      <div class="field">
        <label>Autonomie (nur Abo-/CLI-Agents)</label>
        <select name="autonomy">${Object.entries(AUTONOMY).map(([k, v]) => `<option value="${k}" ${k === a.autonomy ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        <div class="help">Bestimmt, ob der Agent Dateien anlegen/ändern oder Befehle ausführen darf. Er arbeitet immer im Arbeitsordner unten.</div>
      </div>
      <div class="field">
        <label>Arbeitsordner</label>
        <input name="workdir" value="${esc(a.workdir)}" placeholder="${esc(a.cwd)}">
        <div class="help">Leer = eigener Ordner im Projekt. Du kannst z. B. <code>D:\\mein-projekt</code> eintragen, damit ein Coder direkt dort arbeitet.</div>
      </div>
      <div class="row2">
        <div class="field">
          <label>🔗 Ergebnis automatisch weitergeben an</label>
          <select name="relayTo"><option value="">— niemanden —</option>${[...S.agents.values()].filter((x) => x.id !== a.id).sort((x, y) => (y.inView ? 1 : 0) - (x.inView ? 1 : 0) || (x.slot ?? 99) - (y.slot ?? 99)).map((x) => `<option value="${esc(x.id)}" ${a.relay?.toAgentId === x.id ? 'selected' : ''}>${esc(x.avatar)} ${esc(x.name)} (${esc(x.archetypeTitle)})${x.inView ? '' : ` · ${esc(teamLabel(x))}`}</option>`).join('')}</select>
          <div class="help">Nach jedem erfolgreichen Auftrag geht das Ergebnis automatisch an diesen Agent. So baust du Ketten wie Forscher → Texter → Kritiker (max. 14 Übergaben pro Kette, Prüfrunden zählen mit).</div>
        </div>
        <div class="field">
          <label>Anweisung für die Weitergabe</label>
          <input name="relayInstruction" value="${esc(a.relay?.instruction || '')}" placeholder="z. B. Schreib daraus einen Blogpost.">
          <label class="toggle" style="margin-top:8px"><input type="checkbox" name="relayApproval" ${a.relay?.requireApproval ? 'checked' : ''}> ⏸️ Vorher auf meine Freigabe warten</label>
        </div>
      </div>
      <div class="field gear-box">
        <label class="toggle"><input type="checkbox" name="reviewEnabled" ${a.review?.enabled ? 'checked' : ''}> <b>🧐 Prüfer-Modus</b></label>
        <div class="help">Bekommt dieser Agent ein Ergebnis übergeben, bewertet er es mit einer Note. Unter der Mindestnote geht es mit seiner Kritik zurück an den Absender – bis die Note passt oder die Runden aufgebraucht sind. Freigegebene Ergebnisse laufen über seine 🔗 Weitergabe weiter. Bonus: +15 🪙 bei Freigabe im ersten Anlauf.</div>
        <div class="row2" style="margin-top:8px">
          <div><div class="mini-label">Mindestnote</div><select name="reviewMin">${[5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${(a.review?.minScore ?? 7) === n ? 'selected' : ''}>${n}/10</option>`).join('')}</select></div>
          <div><div class="mini-label">Max. Runden</div><select name="reviewRounds">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(a.review?.maxRounds ?? 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>
      </div>
      <div class="field gear-box">
        <label>⭐ Talente (schalten sich mit dem Level frei)</label>
        <div class="talent-list">${S.talentCatalog.map((t) => {
          const unlocked = a.level >= t.level;
          const on = unlocked && !(a.talentsOff || []).includes(t.id);
          return `<label class="talent ${unlocked ? '' : 'locked'}"><input type="checkbox" name="talent" value="${esc(t.id)}" ${on ? 'checked' : ''} ${unlocked ? '' : 'disabled'}><span class="t-lvl">LV ${t.level}</span><span>${esc(t.icon)} <b>${esc(t.title)}</b> – ${esc(t.desc)}</span></label>`;
        }).join('')}</div>
      </div>
      ${!a.projectId && S.projects.length ? `<div class="field gear-box">
        <label>📁 Ergänzung zum Basis-Prompt je Projekt (Stammpersonal)</label>
        <div class="help">Wird im jeweiligen Projekt an die Persönlichkeit unten angehängt – z. B. „Hier sachlich und in Sie-Form schreiben“. Leer = keine Ergänzung.</div>
        ${S.projects.map((p) => `<div style="margin-top:8px"><div class="mini-label">${esc(p.icon)} ${esc(p.name)}</div><textarea name="pp_${esc(p.id)}" rows="2" placeholder="Ergänzung für ${esc(p.name)} …">${esc(a.projectPrompts?.[p.id] || '')}</textarea></div>`).join('')}
      </div>` : ''}
      <div class="field">
        <label>Persönlichkeit & Anweisungen (System-Prompt)</label>
        <textarea name="persona" rows="7">${esc(a.persona)}</textarea>
      </div>
      <div><button class="btn btn-gold" type="submit">💾 Speichern</button></div>
    </form>
    <div class="danger-zone">
      <p>Agent entlassen? Du bekommst ${Math.floor((a.cost || 0) / 2)} 🪙 zurück. Verlauf und Level gehen verloren (der Arbeitsordner bleibt erhalten).</p>
      <button class="btn btn-danger" id="btn-dismiss">Entlassen</button>
    </div>`;
  foot.innerHTML = '';

  let avatar = a.avatar;
  let look = lookFor(a);
  registerScene($('#look-preview'), () => ({ id: 'preview-' + a.id, look, color: a.color, phase: 'idle' }));
  autoScale($('.look-preview'));
  const syncLook = () => {
    $('#look-hair').value = look.hair;
    $('#look-acc').value = look.acc;
    for (const key of ['hairColor', 'skin']) {
      $(`#look-${key}`).querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === look[key]));
    }
  };
  syncLook();
  $('#look-hair').onchange = (e) => { look = { ...look, hair: Number(e.target.value) }; };
  $('#look-acc').onchange = (e) => { look = { ...look, acc: Number(e.target.value) }; };
  for (const key of ['hairColor', 'skin']) {
    $(`#look-${key}`).onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      look = { ...look, [key]: Number(b.dataset.i) };
      syncLook();
    };
  }
  $('#look-random').onclick = () => { look = randomLook(); syncLook(); };
  $('#avatar-grid').onclick = (e) => {
    const b = e.target.closest('[data-av]');
    if (!b) return;
    avatar = b.dataset.av;
    $('#avatar-grid').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
  $('#gear-provider').onchange = (e) => {
    const np = S.providers[e.target.value] || {};
    $('#model-list').innerHTML = (np.modelSuggestions || []).map((m) => `<option value="${esc(m)}">`).join('');
    $('#gear-model').value = np.defaultModel || '';
    $('#prov-help').textContent = np.available ? (np.version || 'bereit') : (np.hint || '');
  };
  $('#gear-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('PATCH', `/api/agents/${a.id}`, {
        name: f.get('name'),
        slot: Number(f.get('slot')),
        projectId: f.get('team') || null,
        ...(!a.projectId ? { projectPrompts: Object.fromEntries(S.projects.map((p) => [p.id, f.get('pp_' + p.id) || ''])) } : {}),
        avatar,
        look,
        provider: f.get('provider'),
        model: f.get('model'),
        autonomy: f.get('autonomy'),
        workdir: f.get('workdir'),
        persona: f.get('persona'),
        relay: f.get('relayTo') ? { toAgentId: f.get('relayTo'), instruction: f.get('relayInstruction'), requireApproval: f.get('relayApproval') === 'on' } : null,
        review: { enabled: f.get('reviewEnabled') === 'on', minScore: Number(f.get('reviewMin')), maxRounds: Number(f.get('reviewRounds')) },
        talentsOff: S.talentCatalog.filter((t) => a.level >= t.level && !f.getAll('talent').includes(t.id)).map((t) => t.id),
      });
      toast('💾 Gespeichert');
      renderDrawer();
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#btn-dismiss').onclick = async () => {
    if (!confirm(`${a.name} wirklich entlassen?`)) return;
    try { await api('DELETE', `/api/agents/${a.id}`); closeDrawer(); } catch (err) { toast(err.message, 'error'); }
  };
}

// Kopieren (Code-Blöcke & ganze Antworten)
$('#drawer').addEventListener('click', async (e) => {
  const codeBtn = e.target.closest('.code .copy');
  if (codeBtn) {
    await navigator.clipboard.writeText(codeBtn.closest('.code').querySelector('code').textContent);
    codeBtn.textContent = 'kopiert ✓';
    setTimeout(() => (codeBtn.textContent = 'kopieren'), 1200);
    return;
  }
  const retryBtn = e.target.closest('[data-retry-mid]');
  if (retryBtn) return retryFailed(S.openId, retryBtn.dataset.retryMid, retryBtn.dataset.unlock === '1');
  const convertBtn = e.target.closest('[data-convert-mid]');
  if (convertBtn) return panels.openConvert({ sourceId: convertBtn.dataset.convertMid, agentId: S.openId });
  const handoffBtn = e.target.closest('[data-handoff-mid]');
  if (handoffBtn) return openHandoff(S.openId, handoffBtn.dataset.handoffMid);
  const msgBtn = e.target.closest('[data-copy-mid]');
  if (msgBtn) {
    const m = S.detail?.messages?.find((x) => x.id === msgBtn.dataset.copyMid);
    if (m) {
      await navigator.clipboard.writeText(m.text);
      msgBtn.textContent = '✓ kopiert';
      setTimeout(() => (msgBtn.textContent = '📋 kopieren'), 1200);
    }
  }
});

// ---------------------------------------------------------------- Übergabe an anderen Agent
// Fehlgeschlagenen Auftrag erneut einreihen (optional mit voller Autonomie).
async function retryFailed(agentId, errorId, unlock) {
  const a = S.agents.get(agentId);
  const msgs = S.detail?.messages || [];
  const idx = msgs.findIndex((m) => m.id === errorId);
  const task = msgs.slice(0, idx).reverse().find((m) => m.role === 'user');
  if (!a || !task) return toast('Kein Auftrag zum Wiederholen gefunden.', 'error');
  try {
    if (unlock) {
      if (!confirm(`${a.name} auf „Volle Kontrolle“ setzen? Der Agent darf dann auch Terminal-Befehle in seinem Arbeitsordner ausführen.`)) return;
      await api('PATCH', `/api/agents/${a.id}`, { autonomy: 'full' });
    }
    await api('POST', `/api/agents/${a.id}/tasks`, { prompt: task.text, projectId: task.meta?.projectId ?? null, profileId: task.meta?.profileId ?? null });
    toast(unlock ? '🔓 Befehle erlaubt – Auftrag läuft erneut' : '🔁 Auftrag läuft erneut');
  } catch (err) { toast(err.message, 'error'); }
}

function openHandoff(fromId, messageId) {
  const from = S.agents.get(fromId);
  const targets = [...S.agents.values()].filter((a) => a.id !== fromId)
    .sort((x, y) => (y.inView ? 1 : 0) - (x.inView ? 1 : 0) || (x.slot ?? 99) - (y.slot ?? 99));
  if (!from) return;
  if (!targets.length) return toast('Rekrutiere zuerst einen zweiten Agent, um Ergebnisse weiterzugeben.');
  openModal(`
    <div class="modal-head"><h2>➡️ Ergebnis von ${esc(from.avatar)} ${esc(from.name)} weitergeben</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <div class="field"><label>An wen?</label></div>
      <div class="bc-list">${targets.map((a, i) => `<label class="bc-item"><input type="radio" name="handoff-to" value="${esc(a.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(a.avatar)}</span><span><div class="n">${esc(a.name)}</div><div class="s">${esc(a.archetypeTitle)} · ${esc(providerShort(a))}${a.inView ? '' : ` · ${esc(teamLabel(a))}`}${a.running ? ' · arbeitet' : ''}</div></span></label>`).join('')}</div>
      <div class="field"><label>Anweisung (optional)</label><textarea id="handoff-text" rows="4" placeholder="z. B. Mach aus dieser Recherche einen lockeren Blogpost."></textarea>
        <div class="help">Der Ziel-Agent bekommt deine Anweisung plus das komplette Ergebnis. +5 🪙 Übergabe-Bonus.</div></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Abbrechen</button><button class="btn btn-gold" id="handoff-send">➡️ Übergeben</button></div>`, { narrow: true });
  $('#handoff-text').focus();
  $('#handoff-send').onclick = async () => {
    const to = $('#modal-card').querySelector('input[name="handoff-to"]:checked')?.value;
    if (!to) return toast('Bitte einen Ziel-Agent wählen.');
    try {
      await api('POST', `/api/agents/${fromId}/handoff`, { toAgentId: to, messageId, instruction: $('#handoff-text').value });
      closeModal();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------- Modals
function openModal(html, { narrow = false } = {}) {
  const card = $('#modal-card');
  card.className = `modal-card${narrow ? ' narrow' : ''}`;
  card.innerHTML = html;
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
  card.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
}

function closeModal() {
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  S.storeSlot = null;
}

$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

// Store
function openStore(slot = null) {
  S.storeSlot = slot;
  renderStore();
}

function renderStore() {
  const full = (S.game.agentCount ?? 0) >= MAX;
  const activeProject = S.projects.find((p) => p.id === S.game.activeProjectId);
  if (S.storeTeam === undefined || (S.storeTeam && S.storeTeam !== activeProject?.id)) S.storeTeam = activeProject?.id || '';
  const provOpts = [`<option value="auto">✨ Empfohlen je Klasse (falls verfügbar)</option>`]
    .concat(providerList().map((p) => `<option value="${esc(p.id)}" ${S.storeProvider === p.id ? 'selected' : ''} ${p.available ? '' : 'disabled'}>${esc(p.label)}${p.available ? '' : ' – nicht verfügbar'}</option>`))
    .join('');
  const cards = S.catalog.map((c) => {
    const afford = S.game.coins >= c.cost;
    const rec = S.providers[c.provider];
    return `<div class="card r-${c.rarity}" style="--c:${esc(c.color)}">
      <div class="top"><span class="big portrait-sm"><canvas data-arch="${esc(c.id)}"></canvas></span><div><h3>${esc(c.title)}</h3><div class="rar rar-${c.rarity}">${RARITY[c.rarity]}</div></div></div>
      <p>${esc(c.blurb)}</p>
      <div class="prov">Empfohlen: ${esc(rec?.short || c.provider)}${c.autonomy ? ' · darf Dateien bearbeiten' : ''}</div>
      <button class="btn ${afford && !full ? 'btn-gold' : ''}" data-hire="${esc(c.id)}" ${afford && !full ? '' : 'disabled'}>
        ${c.cost ? `Rekrutieren · <span class="price">${c.cost} 🪙</span>` : 'Gratis rekrutieren'}
      </button>
    </div>`;
  }).join('');
  openModal(`
    <div class="modal-head"><h2>🛒 Agent Store${S.storeSlot !== null ? ` · für Schreibtisch ${S.storeSlot + 1}` : ''}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="tabs store-tabs">
      <button class="tab ${S.storeTab === 'agents' ? 'active' : ''}" data-stab="agents">👥 Agents</button>
      <button class="tab ${S.storeTab === 'upgrades' ? 'active' : ''}" data-stab="upgrades">🏗️ Büro-Upgrades · Moral ${Math.round((S.game.morale || 1) * 100)}%</button>
    </div>
    <div class="modal-body" id="upgrade-body" ${S.storeTab === 'upgrades' ? '' : 'hidden'}></div>
    <div class="modal-body" ${S.storeTab === 'agents' ? '' : 'hidden'}>
      <div class="store-bar">
        <div class="field"><label>Antrieb für neue Agents</label><select id="store-provider">${provOpts}</select></div>
        <div class="field"><label>Neue Agents gehören zu</label><select id="store-team">
          ${activeProject ? `<option value="${esc(activeProject.id)}" ${S.storeTeam === activeProject.id ? 'selected' : ''}>${esc(activeProject.icon)} Nur Projekt „${esc(activeProject.name)}“</option>` : ''}
          <option value="" ${!S.storeTeam ? 'selected' : ''}>👥 Stammpersonal (in allen Projekten)</option>
        </select></div>
        <div class="wallet">🪙 ${S.game.coins} · 👥 ${S.game.agentCount}/${MAX}</div>
      </div>
      ${full ? '<p style="color:var(--red)">Dein Team ist voll (10/10). Entlasse einen Agent, um Platz zu schaffen.</p>' : ''}
      <div class="store-grid">${cards}</div>
    </div>`);
  $('#modal-card').querySelectorAll('canvas[data-arch]').forEach((cv) => {
    const c = S.catalog.find((x) => x.id === cv.dataset.arch);
    const input = { id: 'store-' + c.id, look: lookFor({ id: 'store-' + c.id, archetype: c.id }), color: c.color, phase: 'idle' };
    registerScene(cv, () => input, { crop: PORTRAIT });
  });
  $('#modal-card').querySelectorAll('[data-stab]').forEach((b) => (b.onclick = () => { S.storeTab = b.dataset.stab; renderStore(); }));
  if (S.storeTab === 'upgrades') panels.renderUpgrades($('#upgrade-body'));
  $('#store-provider').value = S.storeProvider;
  $('#store-provider').onchange = (e) => (S.storeProvider = e.target.value);
  $('#store-team').onchange = (e) => (S.storeTeam = e.target.value);
  $('#modal-card').querySelectorAll('[data-hire]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      const agent = await api('POST', '/api/agents', {
        archetypeId: b.dataset.hire,
        provider: S.storeProvider === 'auto' ? undefined : S.storeProvider,
        slot: S.storeSlot ?? undefined,
        projectId: $('#store-team').value || null,
      });
      closeModal();
      setTimeout(() => {
        const r = desks[agent.slot]?.refs;
        if (r) { r.el.classList.add('flash'); r.input.focus(); r.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 80);
    } catch (err) {
      toast(err.message, 'error');
      b.disabled = false;
    }
  }));
}

// Massenauftrag
function openBroadcast() {
  const list = viewAgents();
  if (!list.length) return toast('Rekrutiere zuerst ein paar Agents im Store.');
  openModal(`
    <div class="modal-head"><h2>📢 Massenauftrag</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <p style="margin-top:0;color:var(--muted)">Gib mehreren Agents gleichzeitig denselben Auftrag – z. B. um Claude und Gemini zu vergleichen oder Arbeit zu verteilen.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn btn-sm" id="bc-all">Alle</button><button class="btn btn-sm" id="bc-idle">Nur freie</button><button class="btn btn-sm" id="bc-none">Keine</button></div>
      <div class="bc-list">${list.map((a) => `<label class="bc-item"><input type="checkbox" value="${esc(a.id)}" ${a.running ? '' : 'checked'}><span>${esc(a.avatar)}</span><span><div class="n">${esc(a.name)}</div><div class="s">${esc(providerShort(a))}${a.running ? ' · arbeitet' : ''}</div></span></label>`).join('')}</div>
      <div class="field"><label>Projekt</label><select id="bc-project">${panels.projectOptions(S.game.activeProjectId)}</select></div>
      <div class="field"><label>Auftrag</label><textarea id="bc-text" rows="6" placeholder="Was sollen die ausgewählten Agents tun?"></textarea></div>
      <div class="help">Tipp: Wähle einen Claude- und einen Gemini-Agent – das zählt als ⚔️ Duell.</div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Abbrechen</button><button class="btn btn-gold" id="bc-send">📢 An Auswahl senden</button></div>`, { narrow: true });
  const boxes = () => [...$('#modal-card').querySelectorAll('.bc-list input')];
  $('#bc-all').onclick = () => boxes().forEach((b) => (b.checked = true));
  $('#bc-none').onclick = () => boxes().forEach((b) => (b.checked = false));
  $('#bc-idle').onclick = () => boxes().forEach((b) => (b.checked = !S.agents.get(b.value)?.running));
  $('#bc-text').focus();
  $('#bc-send').onclick = async () => {
    const agentIds = boxes().filter((b) => b.checked).map((b) => b.value);
    const prompt = $('#bc-text').value.trim();
    if (!agentIds.length || !prompt) return toast('Bitte Agents auswählen und Auftrag eingeben.');
    try {
      const r = await api('POST', '/api/broadcast', { agentIds, prompt, projectId: $('#bc-project').value || null });
      toast(r.duel ? `⚔️ Duell gestartet – ${r.count} Agents treten an` : `📢 Auftrag an ${r.count} Agents verteilt`);
      closeModal();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// Einstellungen
function openSettings() {
  const s = S.settings;
  const provRows = providerList().map((p) => `
    <div class="prov-row"><span class="st">${p.available ? '✅' : '❌'}</span><div><div class="t">${esc(p.label)}</div><div class="d">${esc(p.available ? (p.version || 'bereit') : (p.hint || 'nicht verfügbar'))}</div></div></div>`).join('');
  openModal(`
    <div class="modal-head"><h2>⚙️ Einstellungen</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <div class="section-title">ANTRIEBE</div>
      <div class="prov-list">${provRows}</div>
      <div style="margin-top:10px"><button class="btn btn-sm" id="prov-refresh">🔄 Neu prüfen</button></div>
      <div class="help" style="font-size:12px;color:var(--dim);margin-top:10px;line-height:1.5">
        <b>Abos nutzen:</b> Claude läuft über die Claude Code CLI (dein Claude-Login), Gemini über die Antigravity CLI
        (<code>agy</code>, dein Google-AI-Pro-Konto). Einrichtung siehe README.
      </div>

      <div class="section-title">API-KEYS (OPTIONAL)</div>
      <form class="form" id="settings-form" autocomplete="off">
        <div class="row2">
          <div class="field"><label>Anthropic API-Key ${s.anthropicKeySource === 'env' ? '(aus .env)' : ''}</label><input name="anthropicApiKey" type="password" placeholder="${esc(s.anthropicApiKey || 'sk-ant-…')}"></div>
          <div class="field"><label>Gemini API-Key ${s.geminiKeySource === 'env' ? '(aus .env)' : ''}</label><input name="geminiApiKey" type="password" placeholder="${esc(s.geminiApiKey || 'AIza…')}"></div>
        </div>
        <div class="help" style="font-size:11.5px;color:var(--dim)">Keys werden nur lokal in <code>data/settings.json</code> gespeichert. Leer lassen = unverändert.
          ${s.anthropicKeySource === 'app' ? '<button type="button" class="btn btn-sm btn-ghost" id="clear-ak">Anthropic-Key löschen</button>' : ''}
          ${s.geminiKeySource === 'app' ? '<button type="button" class="btn btn-sm btn-ghost" id="clear-gk">Gemini-Key löschen</button>' : ''}</div>

        <div class="section-title">SPIEL</div>
        <div class="row2">
          <div class="field"><label>Max. gleichzeitig arbeitende Agents: <b id="mp-val">${s.maxParallel}</b></label><input type="range" name="maxParallel" min="1" max="10" value="${s.maxParallel}"></div>
          <div class="field"><label>Verlaufslänge für Gemini/API (Runden)</label><input type="number" name="historyTurnsForStateless" min="0" max="50" value="${s.historyTurnsForStateless}"></div>
        </div>
        <label class="toggle"><input type="checkbox" name="sound" ${s.sound ? 'checked' : ''}> 🔊 Sounds bei erledigten Aufträgen</label>
      </form>

      <div class="danger-zone" style="margin-top:18px">
        <p>Spielstand zurücksetzen: alle Agents, Münzen und Verläufe werden gelöscht. Einstellungen und Arbeitsordner bleiben.</p>
        <button class="btn btn-danger" id="btn-reset-game">Neues Spiel</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Schließen</button><button class="btn btn-gold" id="settings-save">💾 Speichern</button></div>`, { narrow: true });
  const form = $('#settings-form');
  form.maxParallel.oninput = () => ($('#mp-val').textContent = form.maxParallel.value);
  $('#prov-refresh').onclick = async () => {
    try { S.providers = await api('POST', '/api/providers/refresh'); renderProviders(); openSettings(); } catch (e) { toast(e.message, 'error'); }
  };
  const clearKey = (name) => async () => {
    try { S.settings = await api('PUT', '/api/settings', { [name]: null }); toast('Key gelöscht'); openSettings(); } catch (e) { toast(e.message, 'error'); }
  };
  if ($('#clear-ak')) $('#clear-ak').onclick = clearKey('anthropicApiKey');
  if ($('#clear-gk')) $('#clear-gk').onclick = clearKey('geminiApiKey');
  $('#settings-save').onclick = async () => {
    try {
      S.settings = await api('PUT', '/api/settings', {
        anthropicApiKey: form.anthropicApiKey.value,
        geminiApiKey: form.geminiApiKey.value,
        maxParallel: Number(form.maxParallel.value),
        historyTurnsForStateless: Number(form.historyTurnsForStateless.value),
        sound: form.sound.checked,
      });
      toast('💾 Einstellungen gespeichert');
      closeModal();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#btn-reset-game').onclick = async () => {
    if (!confirm('Wirklich ein neues Spiel starten? Alle Agents und Verläufe werden gelöscht.')) return;
    try { await api('POST', '/api/reset-game'); } catch (e) { toast(e.message, 'error'); }
  };
}

// ---------------------------------------------------------------- Live-Events (SSE)
function upsertAgent(a) {
  const old = S.agents.get(a.id);
  S.agents.set(a.id, a);
  if (!a.inView && S.openId === a.id) closeDrawer(); // Agent ist in ein anderes Projekt gewechselt
  if (old && (old.slot !== a.slot || old.inView !== a.inView)) { renderFloor(); return; }
  if (!a.inView) return;
  if (!old || desks[a.slot]?.agentId !== a.id) renderFloor();
  else updateDesk(a);
}

function connect() {
  const es = new EventSource('/api/events');
  es.onopen = async () => {
    $('#ticker').classList.remove('offline');
    if (!S.online) { S.online = true; await loadState(); ticker('Verbunden.'); }
  };
  es.onerror = () => {
    S.online = false;
    $('#ticker').classList.add('offline');
    ticker('Verbindung zum Server verloren – versuche erneut…');
  };
  const on = (type, fn) => es.addEventListener(type, (e) => fn(JSON.parse(e.data)));

  on('agent', (a) => {
    const old = S.agents.get(a.id);
    upsertAgent(a);
    if (S.openId === a.id) {
      const structural = !old || old.running !== a.running || old.messageCount !== a.messageCount || old.queue.length !== a.queue.length;
      if (S.tab === 'chat' && structural) { renderDrawer(); loadDetail(); }
      if (old && !old.running && a.running) ticker(`${a.avatar} ${a.name} hat mit einem Auftrag begonnen.`);
      if (a.unread > 0 && !a.running) api('POST', `/api/agents/${a.id}/ack`).catch(() => {});
    } else if (old && !old.running && a.running) {
      ticker(`${a.avatar} ${a.name} hat mit einem Auftrag begonnen.`);
    }
  });
  on('agentRemoved', ({ id }) => {
    S.agents.delete(id);
    if (S.openId === id) closeDrawer();
    renderFloor();
  });
  on('delta', ({ id, text }) => {
    const a = S.agents.get(id);
    if (!a) return;
    a.live ||= { activity: '✍️ schreibt…', partial: '', startedAt: Date.now() };
    a.live.partial += text;
    if (a.live.partial.length > 12000) a.live.partial = a.live.partial.slice(-8000);
    if (S.openId === id) scheduleLiveRender();
  });
  on('activity', ({ id, text }) => {
    const a = S.agents.get(id);
    if (!a) return;
    a.live ||= { activity: text, partial: '', startedAt: Date.now() };
    a.live.activity = text;
    updateDesk(a);
    if (S.openId === id && $('#live-activity')) $('#live-activity').textContent = text;
  });
  on('team', () => loadState());
  on('game', (g) => {
    const upgradesChanged = (S.game.upgrades || []).length !== (g.upgrades || []).length;
    S.game = g;
    renderStats();
    if (upgradesChanged && $('#modal').classList.contains('open') && S.storeTab === 'upgrades') renderStore();
  });
  on('handoff', (h) => {
    ticker(`${h.fromAvatar} ${h.fromName} → ${h.toAvatar} ${h.toName} übergeben${h.auto ? ` (Kette, Schritt ${h.step})` : ''} · +${h.bonus} 🪙`);
    toast(`📨 ${h.fromName} → ${h.toName} übergeben (+${h.bonus} 🪙)`);
    const to = S.agents.get(h.toId);
    const r = to && desks[to.slot]?.refs;
    if (r) { r.el.classList.remove('flash'); void r.el.offsetWidth; r.el.classList.add('flash'); }
  });
  on('questDone', (q) => {
    const a = S.agents.get(q.id);
    if (a) popCoins(a, q.coins, q.xp);
    toast(`${q.avatar} ${q.name} hat den Auftrag erledigt! +${q.coins} 🪙 +${q.xp} XP`, 'quest');
    ticker(`${q.avatar} ${q.name} hat einen Auftrag erledigt (+${q.coins} 🪙).`);
    if (q.levelUp) {
      setTimeout(() => { toast(`⭐ LEVEL UP! ${q.name} ist jetzt Level ${q.levelUp} – ${q.levelTitle}`, 'levelup'); sound('level'); }, 500);
      if (q.talent) setTimeout(() => toast(`🎁 Neues Talent für ${q.name}: ${q.talent}`, 'levelup'), 1400);
    } else sound('quest');
  });
  on('achievement', (x) => {
    setTimeout(() => { toast(`🏆 ERFOLG: ${x.icon} ${x.title} · +${x.reward} 🪙`, 'achievement'); sound('level'); }, 900);
    ticker(`🏆 Erfolg freigeschaltet: ${x.title} (+${x.reward} 🪙)`);
  });
  on('projects', (list) => { S.projects = list; renderProjectPicker(); });
  on('profiles', (list) => { S.profiles = list; });
  on('inbox', (x) => { S.game.inboxCount = x.count; renderInboxBadge(x.count); });
  on('plan', () => { if ($('#modal-card .plan-grid') && $('#modal').classList.contains('open')) panels.openPlanner(); });
  on('toast', (t) => {
    toast(t.text, t.kind === 'error' ? 'error' : '');
    ticker(t.text);
    if (t.kind === 'recruit') sound('recruit');
    if (t.kind === 'error') sound('error');
  });
  on('providers', (p) => { S.providers = p; renderProviders(); for (const a of S.agents.values()) updateDesk(a); });
  on('limits', (l) => { S.limits = l; renderEnergy(); });
  on('reload', () => location.reload());
}

async function loadState() {
  try {
    const st = await api('GET', '/api/state');
    S.game = st.game;
    S.catalog = st.catalog;
    S.avatars = st.avatars;
    S.providers = st.providers;
    S.settings = st.settings;
    S.limits = st.limits || S.limits;
    S.projects = st.projects || [];
    S.projectIcons = st.projectIcons || [];
    S.upgradeCatalog = st.upgradeCatalog || [];
    S.talentCatalog = st.talentCatalog || [];
    S.profiles = st.profiles || [];
    S.templateCategories = st.templateCategories || [];
    S.planTypes = st.planTypes || [];
    S.agents = new Map(st.agents.map((a) => [a.id, a]));
    desks.forEach((d) => (d.agentId = undefined));
    renderStats();
    renderProviders();
    renderEnergy();
    renderFloor();
    if (S.openId) {
      if (S.agents.has(S.openId)) { renderDrawer(); loadDetail(); } else closeDrawer();
    }
  } catch (err) {
    toast('Konnte Spielstand nicht laden: ' + err.message, 'error');
  }
}

// ---------------------------------------------------------------- Global UI
$('#btn-store').onclick = () => openStore();
$('#btn-quests').onclick = () => panels.openQuests().catch((e) => toast(e.message, 'error'));
$('#btn-schedule').onclick = () => panels.openSchedules().catch((e) => toast(e.message, 'error'));
$('#btn-projects').onclick = () => panels.openProjects().catch((e) => toast(e.message, 'error'));
$('#btn-achievements').onclick = () => panels.openAchievements().catch((e) => toast(e.message, 'error'));
$('#btn-stats').onclick = () => panels.openStats().catch((e) => toast(e.message, 'error'));
$('#btn-inbox').onclick = () => panels.openInbox().catch((e) => toast(e.message, 'error'));
$('#btn-planner').onclick = () => panels.openPlanner().catch((e) => toast(e.message, 'error'));
$('#btn-profiles').onclick = () => panels.openProfiles().catch((e) => toast(e.message, 'error'));
$('#active-project').onchange = async (e) => {
  if (e.target.value === '__new') { e.target.value = S.game.activeProjectId || ''; panels.openProjects().then(() => $('#prj-new')?.click()); return; }
  try { await api('PUT', '/api/active-project', { projectId: e.target.value || null }); } catch (err) { toast(err.message, 'error'); }
};
$('#welcome-store').onclick = () => openStore();
$('#btn-broadcast').onclick = openBroadcast;
$('#btn-settings').onclick = openSettings;
$('#scrim').onclick = closeDrawer;

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (typing) { e.target.blur(); return; }
    if ($('#modal').classList.contains('open')) closeModal();
    else if (S.openId) closeDrawer();
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key)) {
    const slot = e.key === '0' ? 9 : Number(e.key) - 1;
    const a = agentInSlot(slot);
    if (a) openDrawer(a.id); else openStore(slot);
  } else if (e.key === 's') openStore();
  else if (e.key === 'q') $('#btn-quests').click();
  else if (e.key === 'p') $('#btn-projects').click();
  else if (e.key === 'i') $('#btn-inbox').click();
  else if (e.key === 'k') $('#btn-planner').click();
  else if (e.key === 'm') openBroadcast();
});

// Breite des Detail-Fensters: Standard 56 % des Bildschirms, per Ziehen am linken Rand änderbar (wird gemerkt)
(() => {
  const drawer = document.querySelector('.drawer');
  if (!drawer) return;
  const apply = (w) => drawer.style.setProperty('--drawer-w', w ? `${w}px` : '');
  try { apply(Number(localStorage.getItem('drawerW')) || 0); } catch { /* ohne Speicher ok */ }
  const grip = document.createElement('div');
  grip.className = 'drawer-grip';
  grip.title = 'Ziehen: Breite ändern · Doppelklick: zurücksetzen';
  drawer.prepend(grip);
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => apply(Math.round(Math.min(window.innerWidth - 40, Math.max(480, window.innerWidth - ev.clientX))));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      try { localStorage.setItem('drawerW', parseInt(drawer.style.getPropertyValue('--drawer-w')) || ''); } catch { /* egal */ }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { apply(0); try { localStorage.removeItem('drawerW'); } catch { /* egal */ } });
})();

const panels = initPanels({ S, api, openModal, closeModal, toast, esc, renderMarkdown, providerShort, fmtDuration, fmtTime });
initFloor();
renderFloor();
connect();
