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
  };
}

function openFolder(dir) {
  const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
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
route('GET', '/api/agents/:id', ({ id }) => {
  const a = agents.findAgent(id);
  if (!a) throw Object.assign(new Error('Agent nicht gefunden'), { status: 404 });
  return agents.publicAgent(a, { withMessages: true });
});
route('POST', '/api/agents', (_, body) => agents.publicAgent(agents.recruit(body)));
route('PATCH', '/api/agents/:id', ({ id }, body) => agents.publicAgent(agents.updateAgent(id, body)));
route('DELETE', '/api/agents/:id', ({ id }) => { agents.dismiss(id); return { ok: true }; });
route('POST', '/api/agents/:id/tasks', ({ id }, body) => agents.publicAgent(agents.enqueue(id, body.prompt)));
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
route('POST', '/api/broadcast', (_, body) => {
  const ids = Array.isArray(body.agentIds) ? body.agentIds : [];
  if (!ids.length) throw Object.assign(new Error('Keine Agents ausgewählt'), { status: 400 });
  for (const id of ids) agents.enqueue(id, body.prompt);
  return { ok: true, count: ids.length };
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
      const result = await r.handler(params, body);
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
