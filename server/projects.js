// Projekte: bündeln Aufträge und Ergebnisse, mit gemeinsamem Projektordner für alle beteiligten Agents.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { state, saveState, WORKSPACES_DIR } from './store.js';
import * as archive from './archive.js';
import { riskyFolder, addRecent } from './folders.js';

const uid = () => crypto.randomBytes(5).toString('hex');
const MAX_RECENT_REPOS = 8;
const ICONS = ['📁', '🛍️', '🍞', '📈', '🧪', '🎮', '🏡', '✈️', '📚', '💡', '🎨', '⚙️'];
export const PROJECT_ICONS = ICONS;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function slug(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'projekt';
}

export function findProject(id) {
  return id ? state.projects.find((p) => p.id === id) || null : null;
}

export function projectFolder(project) {
  const dir = project.folder && fs.existsSync(project.folder)
    ? project.folder
    : path.join(WORKSPACES_DIR, 'projekte', `${slug(project.name)}-${project.id}`);
  fs.mkdirSync(path.join(dir, 'ergebnisse'), { recursive: true });
  return dir;
}

export function publicProject(p) {
  const results = archive.query({ projectId: p.id, limit: 100000 }).length;
  return { ...p, path: p.folder || path.join(WORKSPACES_DIR, 'projekte', `${slug(p.name)}-${p.id}`), results };
}

export function listProjects() {
  return state.projects.map(publicProject);
}

function validate(body, existing = {}) {
  const name = String(body.name ?? existing.name ?? '').trim().slice(0, 60);
  if (!name) throw fail(400, 'Bitte einen Projektnamen angeben.');
  const folder = String(body.folder ?? existing.folder ?? '').trim();
  if (folder && !fs.existsSync(folder)) throw fail(400, 'Projektordner existiert nicht: ' + folder);
  const repo = String(body.repo ?? existing.repo ?? '').trim();
  if (repo && !fs.existsSync(repo)) throw fail(400, 'Codebase-Ordner existiert nicht: ' + repo);
  return {
    name,
    folder,
    repo,
    recentRepos: withRecent(existing.recentRepos, repo),
    icon: ICONS.includes(body.icon) ? body.icon : existing.icon || '📁',
    color: /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : existing.color || '#60a5fa',
    description: String(body.description ?? existing.description ?? '').slice(0, 500),
    profileId: body.profileId !== undefined
      ? (state.profiles.some((x) => x.id === body.profileId) ? body.profileId : null)
      : existing.profileId ?? null,
  };
}

const withRecent = (list, repo) => addRecent(list, repo, MAX_RECENT_REPOS);

function systemDirs() {
  return [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData,
    ...(process.platform === 'win32' ? [] : ['/bin', '/boot', '/dev', '/etc', '/lib', '/proc', '/sbin', '/sys', '/usr', '/var'])];
}

// Codebase-Ordner wechseln ('' = keiner). Riskante Ordner nur mit ausdrücklicher Bestätigung.
// Laufende Aufträge und Ketten behalten ihren Ordner, der Wechsel gilt für neue Aufträge.
export function setRepo(id, repo, { confirmRisky = false } = {}) {
  const p = findProject(id);
  if (!p) throw fail(404, 'Projekt nicht gefunden.');
  const dir = String(repo || '').trim();
  if (dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw fail(400, 'Ordner existiert nicht: ' + dir);
    const risk = riskyFolder(dir, { home: os.homedir(), systemDirs: systemDirs() });
    if (risk && !confirmRisky) {
      throw Object.assign(fail(409, `„${dir}“ ist ein riskanter Arbeitsordner (${risk}). Agents mit Schreibrechten können dort viel kaputt machen.`), { code: 'risky' });
    }
  }
  p.repo = dir;
  p.recentRepos = withRecent(p.recentRepos, dir);
  saveState();
  return p;
}

export function forgetRepo(id, repo) {
  const p = findProject(id);
  if (!p) throw fail(404, 'Projekt nicht gefunden.');
  const dir = String(repo || '').trim().toLowerCase();
  p.recentRepos = (p.recentRepos || []).filter((r) => r.toLowerCase() !== dir);
  saveState();
  return p;
}

export function createProject(body) {
  const p = { id: uid(), createdAt: Date.now(), ...validate(body) };
  state.projects.push(p);
  projectFolder(p);
  saveState();
  return p;
}

export function updateProject(id, body) {
  const p = findProject(id);
  if (!p) throw fail(404, 'Projekt nicht gefunden.');
  Object.assign(p, validate(body, p));
  saveState();
  return p;
}

export function deleteProject(id) {
  const p = findProject(id);
  if (!p) throw fail(404, 'Projekt nicht gefunden.');
  state.projects = state.projects.filter((x) => x.id !== id);
  if (state.activeProjectId === id) state.activeProjectId = null;
  for (const s of state.schedules) if (s.projectId === id) s.projectId = null;
  archive.clearProject(id); // Ergebnisse bleiben im Archiv (ohne Projekt), Ordner bleibt auf der Platte
  saveState();
}

export function setActiveProject(id) {
  if (id && !findProject(id)) throw fail(404, 'Projekt nicht gefunden.');
  state.activeProjectId = id || null;
  saveState();
}

// Kontext, der einem Auftrag im Projekt vorangestellt wird.
// `repo` ist der beim Auftrag festgehaltene Codebase-Ordner (kann vom aktuellen des Projekts abweichen).
export function projectPreamble(project, repo = project.repo) {
  const dir = projectFolder(project);
  return `[Projekt „${project.name}“${project.description ? ` – ${project.description}` : ''}]\n`
    + `Gemeinsamer Projektordner aller beteiligten Agents: ${dir}\n`
    + (repo ? `Codebase dieses Auftrags (dein Arbeitsordner): ${repo}\n`
      + 'Ergebnisdateien tragen eine Zeile „Codebase: …“ – nutze nur Ergebnisse mit derselben Codebase.\n' : '')
    + `Ergebnisse der anderen Agents liegen dort unter "ergebnisse/". Lege projektbezogene Dateien in diesem Ordner ab.\n\n`;
}

// Ergebnis zusätzlich als Markdown-Datei im Projektordner ablegen.
export function saveResultFile(project, entry) {
  try {
    const dir = path.join(projectFolder(project), 'ergebnisse');
    const d = new Date(entry.ts);
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const file = path.join(dir, `${stamp}_${slug(entry.agentName)}_${slug(entry.prompt.split('\n')[0]).slice(0, 30)}.md`);
    fs.writeFileSync(file, entryMarkdown(entry));
    return file;
  } catch {
    return null;
  }
}

function entryMarkdown(e) {
  const when = new Date(e.ts).toLocaleString('de-DE');
  return `## ${e.agentAvatar || ''} ${e.agentName} (${e.archetypeTitle}) · ${when}\n\n`
    + `**Auftrag:**\n\n> ${e.prompt.replace(/\n/g, '\n> ')}\n\n`
    + `${e.repo ? `Codebase: ${e.repo}\n\n` : ''}`
    + `${e.score != null ? `**Prüfnote:** ${e.score}/10\n\n` : ''}`
    + `${e.text}\n`;
}

export function exportMarkdown(projectId) {
  const p = projectId === 'all' ? null : findProject(projectId);
  if (projectId !== 'all' && !p) throw fail(404, 'Projekt nicht gefunden.');
  const items = archive.query({ projectId: p?.id, limit: 100000 }).reverse();
  const title = p ? `${p.icon} ${p.name}` : 'Alle Ergebnisse';
  const head = `# ${title}\n\nExport aus dem Agent Store · ${new Date().toLocaleString('de-DE')} · ${items.length} Ergebnisse\n\n`;
  return {
    filename: `${p ? slug(p.name) : 'alle-ergebnisse'}-${new Date().toISOString().slice(0, 10)}.md`,
    body: head + items.map(entryMarkdown).join('\n---\n\n'),
  };
}
