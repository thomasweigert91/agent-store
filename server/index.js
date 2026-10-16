// Agent Store – lokaler HTTP-Server (keine externen Abhängigkeiten).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, state, settings, saveState, saveSettings, resetState, getApiKey, START_COINS } from './store.js';
import { addClient, emit } from './events.js';
import { CATALOG, AVATARS } from './catalog.js';
import { detectAll, providerStatus } from './providers/index.js';
import * as agents from './agents.js';
import * as archive from './archive.js';
import * as projects from './projects.js';
import * as templates from './templates.js';
import * as scheduler from './scheduler.js';
import * as progress from './progress.js';
import * as profiles from './profiles.js';
import * as planner from './planner.js';
import * as inbox from './inbox.js';
import { pickFolder } from './folders.js';

// Profil-Auswahl aus Anfragen: fehlt = Standard des Projekts, leer = kein Profil, sonst ID.
const profileOpt = (v) => (v === undefined ? undefined : v || 'none');

const PORT = Number(process.env.PORT) || 4777;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 2_000_000) { reject(Object.assign(new Error('Anfrage zu groß'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Ungültiges JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function maskKey(k) {
  return k ? `••••${k.slice(-4)}` : '';
}

function publicSettings() {
  return {
    maxParallel: settings.maxParallel,
    sound: settings.sound,
    historyTurnsForStateless: settings.historyTurnsForStateless,
    anthropicApiKey: maskKey(getApiKey('anthropic')),
    geminiApiKey: maskKey(getApiKey('gemini')),
    anthropicKeySource: settings.anthropicApiKey ? 'app' : process.env.ANTHROPIC_API_KEY ? 'env' : '',
    geminiKeySource: settings.geminiApiKey ? 'app' : process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'env' : '',
  };
}

function fullState() {
  return {
    game: agents.gameInfo(),
    agents: state.agents.map((a) => agents.publicAgent(a)),
    catalog: CATALOG,
    avatars: AVATARS,
    providers: providerStatus,
    settings: publicSettings(),
    limits: agents.limitsCache.value,
    projects: projects.listProjects(),
    projectIcons: projects.PROJECT_ICONS,
    profiles: profiles.listProfiles(),
    templateCategories: templates.CATEGORIES,
    planTypes: planner.PLAN_TYPES,
    upgradeCatalog: progress.UPGRADES,
    talentCatalog: progress.TALENTS,
  };
}

function openFolder(dir) {
  const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  // Auf Servern ohne Desktop gibt es kein xdg-open – Fehler abfangen statt abzustürzen.
  const child = spawn(cmd, [dir], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Schutz: nur localhost als Host (gegen DNS-Rebinding) und für schreibende Anfragen
// einen eigenen Header (erzwingt CORS-Preflight → fremde Websites können nichts auslösen).
function guard(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return 'Ungültiger Host';
  if (req.method !== 'GET' && req.headers['x-agent-store'] !== '1') return 'Fehlender Header';
  return null;
}

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/state', () => fullState());

const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });
const emitProjects = () => emit('projects', projects.listProjects());

// --- Projekte & Archiv
route('GET', '/api/projects', () => projects.listProjects());
route('POST', '/api/projects', (_, body) => {
  const p = projects.createProject(body);
  agents.ensureSlots(); // Stammpersonal bekommt Plätze im neuen Büro
  if (body.activate) projects.setActiveProject(p.id);
  progress.checkAchievements();
  emitProjects();
  emit('game', agents.gameInfo());
  if (body.activate) emit('team', agents.teamInfo());
  return projects.publicProject(p);
});
route('PATCH', '/api/projects/:id', ({ id }, body) => { const p = projects.updateProject(id, body); emitProjects(); return projects.publicProject(p); });
route('DELETE', '/api/projects/:id', ({ id }) => {
  const team = state.agents.filter((a) => a.projectId === id);
  if (team.length) {
    throw Object.assign(new Error(`Das Projekt hat noch ${team.length} eigene Agents (${team.map((a) => a.name).join(', ')}). Entlasse sie oder mach sie zu Stammpersonal.`), { status: 400 });
  }
  const wasActive = state.activeProjectId === id;
  projects.deleteProject(id);
  agents.ensureSlots();
  emitProjects();
  emit('game', agents.gameInfo());
  if (wasActive) emit('team', agents.teamInfo());
  return { ok: true };
});
route('PUT', '/api/active-project', (_, body) => {
  projects.setActiveProject(body.projectId || null);
  emit('game', agents.gameInfo());
  emit('team', agents.teamInfo()); // Büro wechselt → Oberfläche lädt Agents neu
  return { ok: true };
});
route('POST', '/api/projects/:id/open-folder', ({ id }) => {
  const p = projects.findProject(id);
  if (!p) throw notFound('Projekt nicht gefunden');
  openFolder(projects.projectFolder(p));
  return { ok: true };
});
route('GET', '/api/projects/:id/export', ({ id }) => {
  const { filename, body } = projects.exportMarkdown(id);
  return { __raw: { type: 'text/markdown; charset=utf-8', filename, body } };
});
route('GET', '/api/archive', (_, __, url) => archive.query({
  projectId: url.searchParams.get('projectId') || '',
  q: url.searchParams.get('q') || '',
  agentId: url.searchParams.get('agentId') || '',
  limit: Math.min(5000, Number(url.searchParams.get('limit')) || 200),
}));

route('GET', '/api/archive/:id', ({ id }) => {
  const e = archive.find(id);
  if (!e) throw notFound('Ergebnis nicht gefunden');
  return e;
});

// --- Quest-Board
route('GET', '/api/templates', () => templates.listTemplates());
route('POST', '/api/templates', (_, body) => templates.createTemplate(body));
route('DELETE', '/api/templates/:id', ({ id }) => { templates.deleteTemplate(id); return { ok: true }; });
route('POST', '/api/templates/:id/run', ({ id }, body) => {
  const t = templates.findTemplate(id);
  if (!t) throw notFound('Vorlage nicht gefunden');
  const agent = agents.enqueue(body.agentId, templates.fillTemplate(t, body.values), {
    projectId: body.projectId === undefined ? undefined : body.projectId || null,
    profileId: profileOpt(body.profileId),
    source: 'template',
    templateTitle: t.title,
    structure: t.structure,
    limits: t.limits,
  });
  progress.bump('templateRuns');
  progress.checkAchievements();
  return agents.publicAgent(agent);
});

route('GET', '/api/templates/export', (_, __, url) => {
  const cat = url.searchParams.get('category') || '';
  return { __raw: { type: 'application/json; charset=utf-8', filename: `agent-store-vorlagen${cat ? '-' + cat : ''}.json`, body: JSON.stringify(templates.exportTemplates(cat), null, 2) } };
});
route('POST', '/api/templates/import', (_, body) => templates.importTemplates(body));

// --- Kontext-Profile
const emitProfiles = () => emit('profiles', profiles.listProfiles());
route('GET', '/api/profiles', () => profiles.listProfiles());
route('POST', '/api/profiles', (_, body) => { const p = profiles.createProfile(body); emitProfiles(); return p; });
route('PATCH', '/api/profiles/:id', ({ id }, body) => { const p = profiles.updateProfile(id, body); emitProfiles(); return p; });
route('DELETE', '/api/profiles/:id', ({ id }) => {
  profiles.deleteProfile(id);
  archive.clearProfile(id);
  emitProfiles();
  emit('projects', projects.listProjects());
  return { ok: true };
});

// --- Planer
const emitPlan = () => emit('plan', {});
route('GET', '/api/plan', (_, __, url) => planner.listPlanItems({ from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '' }));
route('POST', '/api/plan', (_, body) => { const it = planner.createPlanItem(body); emitPlan(); return it; });
route('POST', '/api/plan/bulk', (_, body) => { const items = planner.planMany(body); emitPlan(); return { created: items.length, items }; });
route('PATCH', '/api/plan/:id', ({ id }, body) => { const it = planner.updatePlanItem(id, body); emitPlan(); return it; });
route('DELETE', '/api/plan/:id', ({ id }) => { planner.deletePlanItem(id); emitPlan(); return { ok: true }; });
route('POST', '/api/plan/:id/generate', ({ id }, body) => {
  const it = planner.findPlanItem(id);
  if (!it) throw notFound('Eintrag nicht gefunden');
  const agentId = body.agentId || it.agentId;
  if (!agents.findAgent(agentId)) throw Object.assign(new Error('Bitte einen Agent für den Entwurf wählen.'), { status: 400 });
  const t = it.templateId ? templates.findTemplate(it.templateId) : null;
  let prompt;
  if (t) {
    // Erstes Vorlagen-Feld bekommt den Titel, falls nicht ausgefüllt.
    const values = { ...(it.values || {}) };
    if (t.fields[0] && !values[t.fields[0]]) values[t.fields[0]] = it.title;
    prompt = templates.fillTemplate(t, values);
  } else {
    prompt = `${it.type}: ${it.title}`;
  }
  if (it.notes) prompt += `\n\nHinweise: ${it.notes}`;
  prompt += `\n\n(Geplant für ${new Date(it.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })})`;
  agents.enqueue(agentId, prompt, {
    projectId: it.projectId ?? null,
    profileId: it.profileId || undefined,
    source: 'planner',
    templateTitle: `📅 ${it.title}`,
    structure: t?.structure,
    limits: t?.limits,
    planItemId: it.id,
  });
  planner.updatePlanItem(id, { agentId });
  it.pending = true;
  emitPlan();
  return it;
});

// --- Postfach
const inboxDone = (result) => { emit('game', agents.gameInfo()); emitProfiles(); emitPlan(); return result; };
route('GET', '/api/inbox', (_, __, url) => inbox.listInbox({ projectId: url.searchParams.get('projectId') || '', profileId: url.searchParams.get('profileId') || '' }));
route('POST', '/api/inbox/:id/approve', ({ id }, body) => inboxDone(inbox.approve(id, body)));
route('POST', '/api/inbox/:id/reject', ({ id }, body) => inboxDone(inbox.reject(id, body)));
route('POST', '/api/inbox/:id/done', ({ id }) => inboxDone(inbox.done(id)));
route('POST', '/api/inbox/:id/edit', ({ id }, body) => inbox.edit(id, body));
route('POST', '/api/inbox/:id/revise', ({ id }, body) => inboxDone(inbox.revise(id, body, (aid, p, o) => agents.enqueue(aid, p, o))));

// --- Umwandeln: Ergebnis in ein oder mehrere Vorlagen-Formate überführen
route('POST', '/api/convert', (_, body) => {
  const entry = archive.find(body.sourceId);
  let text = entry ? entry.finalText || entry.text : null;
  if (!text && body.agentId) text = agents.findAgent(body.agentId)?.messages.find((m) => m.id === body.sourceId)?.text;
  if (!text) throw notFound('Ausgangsergebnis nicht gefunden');
  const ids = Array.isArray(body.templateIds) ? body.templateIds : [];
  const list = ids.map((x) => templates.findTemplate(x)).filter(Boolean);
  if (!list.length) throw Object.assign(new Error('Bitte mindestens ein Zielformat wählen.'), { status: 400 });
  const target = body.targetAgentId || entry?.agentId || body.agentId;
  if (!agents.findAgent(target)) throw Object.assign(new Error('Bitte einen Agent wählen.'), { status: 400 });
  for (const t of list) {
    agents.enqueue(target, templates.conversionPrompt(t, text, body.note), {
      projectId: entry ? entry.projectId ?? null : undefined,
      profileId: entry ? entry.profileId || 'none' : undefined,
      source: 'convert',
      templateTitle: `♻️ ${t.title}`,
      structure: t.structure,
      limits: t.limits,
    });
  }
  return { ok: true, count: list.length };
});

// --- Schichtplan
const refreshShiftAgents = (...ids) => ids.filter(Boolean).forEach((id) => agents.refreshAgent(id));
route('GET', '/api/schedules', () => scheduler.listSchedules());
route('POST', '/api/schedules', (_, body) => { const s = scheduler.createSchedule(body); refreshShiftAgents(s.agentId); return s; });
route('PATCH', '/api/schedules/:id', ({ id }, body) => {
  const before = state.schedules.find((x) => x.id === id)?.agentId;
  const s = scheduler.updateSchedule(id, body);
  refreshShiftAgents(before, s.agentId);
  return s;
});
route('DELETE', '/api/schedules/:id', ({ id }) => {
  const before = state.schedules.find((x) => x.id === id)?.agentId;
  scheduler.deleteSchedule(id);
  refreshShiftAgents(before);
  return { ok: true };
});
route('POST', '/api/schedules/:id/run-now', ({ id }) => {
  const s = state.schedules.find((x) => x.id === id);
  if (!s) throw notFound('Schicht nicht gefunden');
  agents.enqueue(s.agentId, s.prompt, { projectId: s.projectId, source: 'schedule', scheduleTitle: s.title });
  return { ok: true };
});

// --- Progression
route('GET', '/api/progress', () => ({
  upgrades: progress.UPGRADES.map((u) => ({ ...u, owned: state.upgrades.includes(u.id) })),
  morale: progress.moraleFactor(),
  achievements: progress.achievementList(),
  talents: progress.TALENTS,
}));
route('POST', '/api/upgrades/:id/buy', ({ id }) => {
  const u = progress.buyUpgrade(id);
  progress.checkAchievements();
  emit('game', agents.gameInfo());
  emit('toast', { kind: 'recruit', text: `${u.icon} ${u.title} gekauft – Team-Moral steigt!` });
  return { ok: true };
});
route('GET', '/api/stats', () => progress.statistics());

route('GET', '/api/agents/:id', ({ id }) => {
  const a = agents.findAgent(id);
  if (!a) throw Object.assign(new Error('Agent nicht gefunden'), { status: 404 });
  return agents.publicAgent(a, { withMessages: true });
});
route('POST', '/api/agents', (_, body) => { const a = agents.recruit(body); progress.checkAchievements(); return agents.publicAgent(a); });
route('PATCH', '/api/agents/:id', ({ id }, body) => agents.publicAgent(agents.updateAgent(id, body)));
route('DELETE', '/api/agents/:id', ({ id }) => { agents.dismiss(id); return { ok: true }; });
route('POST', '/api/agents/:id/tasks', ({ id }, body) => agents.publicAgent(agents.enqueue(id, body.prompt, {
  projectId: body.projectId === undefined ? undefined : body.projectId || null,
  profileId: profileOpt(body.profileId),
})));
route('POST', '/api/agents/:id/relay-decision', ({ id }, body) => {
  agents.relayDecision(id, Boolean(body.approve));
  inbox.notifyChanged();
  emit('game', agents.gameInfo());
  return { ok: true };
});
route('POST', '/api/agents/:id/handoff', ({ id }, body) => agents.publicAgent(agents.handoff(id, {
  toAgentId: body.toAgentId,
  messageId: body.messageId,
  instruction: body.instruction,
})));
route('DELETE', '/api/agents/:id/tasks/:taskId', ({ id, taskId }) => { agents.removeQueued(id, taskId); return { ok: true }; });
route('POST', '/api/agents/:id/stop', ({ id }) => { agents.stop(id); return { ok: true }; });
route('POST', '/api/agents/:id/reset', ({ id }) => { agents.resetConversation(id); return { ok: true }; });
route('POST', '/api/agents/:id/ack', ({ id }) => { agents.acknowledge(id); return { ok: true }; });
route('POST', '/api/agents/:id/open-folder', ({ id }) => {
  const a = agents.findAgent(id);
  if (!a) throw Object.assign(new Error('Agent nicht gefunden'), { status: 404 });
  openFolder(agents.agentCwd(a));
  return { ok: true };
});
route('POST', '/api/pick-folder', async (_, body) => ({ path: await pickFolder(typeof body.start === 'string' ? body.start.trim() : '') }));
route('POST', '/api/broadcast', (_, body) => {
  const ids = Array.isArray(body.agentIds) ? body.agentIds : [];
  if (!ids.length) throw Object.assign(new Error('Keine Agents ausgewählt'), { status: 400 });
  const opts = { projectId: body.projectId === undefined ? undefined : body.projectId || null, profileId: profileOpt(body.profileId), source: 'broadcast' };
  for (const id of ids) agents.enqueue(id, body.prompt, opts);
  const chosen = ids.map((id) => agents.findAgent(id)).filter(Boolean);
  const isClaude = (a) => a.provider.startsWith('claude');
  const isGemini = (a) => ['antigravity-cli', 'gemini-cli', 'gemini-api'].includes(a.provider);
  const duel = chosen.some(isClaude) && chosen.some(isGemini);
  if (duel) { progress.bump('duels'); progress.checkAchievements(); }
  return { ok: true, count: ids.length, duel };
});
route('POST', '/api/providers/refresh', async () => {
  await detectAll();
  emit('providers', providerStatus);
  return providerStatus;
});
route('PUT', '/api/settings', async (_, body) => {
  if (Number.isFinite(Number(body.maxParallel))) settings.maxParallel = Math.max(1, Math.min(10, Math.round(Number(body.maxParallel))));
  if (typeof body.sound === 'boolean') settings.sound = body.sound;
  if (Number.isFinite(Number(body.historyTurnsForStateless))) settings.historyTurnsForStateless = Math.max(0, Math.min(50, Math.round(Number(body.historyTurnsForStateless))));
  for (const k of ['anthropicApiKey', 'geminiApiKey']) {
    if (body[k] === null) settings[k] = '';
    else if (typeof body[k] === 'string' && body[k].trim() && !body[k].startsWith('••••')) settings[k] = body[k].trim();
  }
  saveSettings();
  await detectAll();
  emit('providers', providerStatus);
  return publicSettings();
});
route('POST', '/api/reset-game', () => {
  for (const a of state.agents) agents.stop(a.id);
  resetState();
  emit('reload', {});
  return { ok: true, coins: START_COINS };
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const blocked = guard(req);
  if (blocked) return sendJson(res, 403, { error: blocked });

  if (url.pathname === '/api/events') {
    addClient(res);
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return sendJson(res, 404, { error: 'Unbekannter Endpunkt' });
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const result = await r.handler(params, body, url);
      if (result?.__raw) {
        const { type, filename, body: raw } = result.__raw;
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          ...(filename ? { 'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"` } : {}),
        });
        return res.end(raw);
      }
      return sendJson(res, 200, result ?? { ok: true });
    } catch (err) {
      if (!err.status) console.error(err);
      return sendJson(res, err.status || 500, { error: err.message || 'Serverfehler' });
    }
  }

  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Methode nicht erlaubt' });
  serveStatic(req, res, url.pathname);
});

await detectAll();
agents.recoverOnBoot();
scheduler.startScheduler(
  (id, prompt, opts) => agents.enqueue(id, prompt, opts),
  (s) => { progress.bump('scheduledRuns'); progress.checkAchievements(); agents.refreshAgent(s.agentId); },
);
progress.checkAchievements(); // rückwirkend für bestehende Spielstände

server.listen(PORT, HOST, () => {
  const ok = (id) => (providerStatus[id]?.available ? '✅' : '❌');
  console.log(`\n  🏢 Agent Store läuft auf  http://localhost:${PORT}\n`);
  console.log(`  ${ok('claude-cli')} Claude (Abo)   ${ok('antigravity-cli')} Gemini (Abo)   ${ok('claude-api')} Claude API   ${ok('gemini-api')} Gemini API   ✅ Demo\n`);
  console.log('  Beenden mit Strg+C\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist belegt – läuft der Agent Store schon? Sonst: PORT=4778 setzen.`);
    process.exit(1);
  }
  throw err;
});

const shutdown = () => {
  for (const a of state.agents) agents.stop(a.id);
  setTimeout(() => { saveState(true); process.exit(0); }, 500);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
