// Druckansicht für Projekt-Ergebnisse – im Browser "Als PDF speichern" wählen.
import { renderMarkdown } from './markdown.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const id = new URLSearchParams(location.search).get('project') || 'all';

const [projects, items] = await Promise.all([
  fetch('/api/projects').then((r) => r.json()),
  fetch(`/api/archive?limit=5000&projectId=${encodeURIComponent(id === 'all' ? '' : id)}`).then((r) => r.json()),
]);
const p = projects.find((x) => x.id === id);
const title = p ? `${p.icon} ${p.name}` : 'Alle Ergebnisse';
document.title = `${p ? p.name : 'Alle Ergebnisse'} – Agent Store`;
document.getElementById('title').textContent = title;
document.getElementById('sub').textContent = `${p?.description ? p.description + ' · ' : ''}${items.length} Ergebnisse · erstellt am ${new Date().toLocaleString('de-DE')}`;

document.getElementById('list').innerHTML = items.length
  ? items.slice().reverse().map((e) => `
    <article>
      <h2>${esc(e.agentAvatar || '')} ${esc(e.agentName)} <small>(${esc(e.archetypeTitle)})</small></h2>
      <div class="meta">${esc(new Date(e.ts).toLocaleString('de-DE'))} · ${esc(e.providerLabel || e.provider)}${e.model ? ' · ' + esc(e.model) : ''}${typeof e.score === 'number' ? ` · Prüfnote ${e.score}/10` : ''}</div>
      <div class="prompt">${esc(e.prompt)}</div>
      <div class="content">${renderMarkdown(e.text)}</div>
    </article>`).join('')
  : '<p class="empty">Noch keine Ergebnisse.</p>';

if (items.length) setTimeout(() => window.print(), 400);
