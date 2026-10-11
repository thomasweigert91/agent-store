// Zusatzfenster: Quest-Board, Schichtplan, Projekte & Archiv, Erfolge, Statistik, Büro-Upgrades.
let C = null; // Kontext aus app.js (State, API, Modal, Helfer)

export function initPanels(ctx) {
  C = ctx;
  return { openQuests, openSchedules, openProjects, openAchievements, openStats, renderUpgrades, projectOptions, projectLabel };
}

const $ = (sel, root = document) => root.querySelector(sel);
const DAYS = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];

function agentsSorted() {
  return [...C.S.agents.values()].sort((a, b) => a.slot - b.slot);
}

export function projectOptions(selected, { none = 'Kein Projekt' } = {}) {
  const esc = C.esc;
  return [`<option value="">${esc(none)}</option>`]
    .concat(C.S.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.icon)} ${esc(p.name)}</option>`))
    .join('');
}

export function projectLabel(id) {
  const p = C.S.projects.find((x) => x.id === id);
  return p ? `${p.icon} ${p.name}` : '';
}

function agentOptions(selected, preferArchetype) {
  const list = agentsSorted();
  const pick = selected || list.find((a) => a.archetype === preferArchetype)?.id || list[0]?.id;
  return list.map((a) => `<option value="${C.esc(a.id)}" ${a.id === pick ? 'selected' : ''}>${C.esc(a.avatar)} ${C.esc(a.name)} (${C.esc(a.archetypeTitle)})</option>`).join('');
}

function needAgents() {
  if (C.S.agents.size) return false;
  C.toast('Rekrutiere zuerst einen Agent im Store.');
  return true;
}

// ---------------------------------------------------------------- Quest-Board
async function openQuests() {
  const list = await C.api('GET', '/api/templates');
  const esc = C.esc;
  const arch = (id) => C.S.catalog.find((c) => c.id === id);
  C.openModal(`
    <div class="modal-head"><h2>📜 Quest-Board</h2><button class="btn btn-sm" id="tpl-new">＋ Eigene Vorlage</button><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-intro">Fertige Aufträge zum Anklicken – Felder ausfüllen, Agent wählen, los. Eigene Vorlagen nutzen Platzhalter wie <code>{{thema}}</code>.</p>
      <div class="quest-grid">${list.map((t) => `
        <button class="quest-card" data-tpl="${esc(t.id)}" style="--c:${esc(arch(t.archetype)?.color || '#60a5fa')}">
          <span class="q-icon">${esc(t.icon)}</span>
          <span class="q-title">${esc(t.title)}</span>
          <span class="q-meta">${t.builtin ? 'Vorlage' : 'Eigene'}${arch(t.archetype) ? ` · ideal: ${esc(arch(t.archetype).avatar)} ${esc(arch(t.archetype).title)}` : ''}</span>
          <span class="q-fields">${t.fields.map((f) => `<i>${esc(f)}</i>`).join('')}</span>
          ${t.builtin ? '' : `<span class="q-del" data-del="${esc(t.id)}" title="Vorlage löschen">🗑</span>`}
        </button>`).join('')}
      </div>
    </div>`);
  $('#tpl-new').onclick = () => openTemplateEditor();
  $('#modal-card').querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = async (e) => {
    if (e.target.closest('[data-del]')) {
      if (!confirm('Eigene Vorlage löschen?')) return;
      try { await C.api('DELETE', `/api/templates/${e.target.closest('[data-del]').dataset.del}`); openQuests(); } catch (err) { C.toast(err.message, 'error'); }
      return;
    }
    openQuestForm(list.find((t) => t.id === b.dataset.tpl));
  }));
}

function openQuestForm(t) {
  if (needAgents()) return;
  const esc = C.esc;
  const long = (f) => /text|email|inhalt|code|notizen/i.test(f);
  C.openModal(`
    <div class="modal-head"><h2>${esc(t.icon)} ${esc(t.title)}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="quest-form" autocomplete="off">
        ${t.fields.map((f) => `<div class="field"><label>${esc(f[0].toUpperCase() + f.slice(1))}</label>${long(f)
          ? `<textarea name="${esc(f)}" rows="5"></textarea>`
          : `<input name="${esc(f)}">`}</div>`).join('')}
        <div class="row2">
          <div class="field"><label>Agent</label><select name="agentId">${agentOptions(null, t.archetype)}</select>
            <div class="help">Hat der Agent eine 🔗 Kette, läuft sie automatisch weiter.</div></div>
          <div class="field"><label>Projekt</label><select name="projectId">${projectOptions(C.S.game.activeProjectId)}</select></div>
        </div>
        <div class="field"><label>Vorschau</label><pre class="quest-preview" id="quest-preview"></pre></div>
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="quest-back">← Zurück</button><button class="btn btn-gold" id="quest-go">▶ Quest starten</button></div>`, { narrow: true });
  const form = $('#quest-form');
  const values = () => Object.fromEntries(t.fields.map((f) => [f, form.elements[f].value]));
  const preview = () => {
    $('#quest-preview').textContent = t.prompt.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => values()[k.trim()]?.trim() || `‹${k.trim()}›`);
  };
  form.addEventListener('input', preview);
  preview();
  form.elements[t.fields[0]]?.focus();
  $('#quest-back').onclick = openQuests;
  $('#quest-go').onclick = async () => {
    try {
      await C.api('POST', `/api/templates/${t.id}/run`, { agentId: form.elements.agentId.value, values: values(), projectId: form.elements.projectId.value || null });
      C.toast(`📜 Quest „${t.title}“ gestartet`);
      C.closeModal();
    } catch (err) { C.toast(err.message, 'error'); }
  };
}

function openTemplateEditor() {
  const esc = C.esc;
  C.openModal(`
    <div class="modal-head"><h2>＋ Eigene Vorlage</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="tpl-form" autocomplete="off">
        <div class="row2">
          <div class="field"><label>Titel</label><input name="title" maxlength="60" placeholder="z. B. Wochenbericht"></div>
          <div class="field"><label>Symbol</label><input name="icon" maxlength="4" value="📜"></div>
        </div>
        <div class="field"><label>Ideale Agent-Klasse</label><select name="archetype"><option value="">– egal –</option>${C.S.catalog.map((c) => `<option value="${esc(c.id)}">${esc(c.avatar)} ${esc(c.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Auftragstext</label><textarea name="prompt" rows="7" placeholder="Fasse die wichtigsten Punkte zu {{thema}} für {{zielgruppe}} zusammen."></textarea>
          <div class="help">Alles in <code>{{doppelten Klammern}}</code> wird beim Starten als Feld abgefragt.</div></div>
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="tpl-back">← Zurück</button><button class="btn btn-gold" id="tpl-save">💾 Vorlage speichern</button></div>`, { narrow: true });
  $('#tpl-back').onclick = openQuests;
  $('#tpl-save').onclick = async () => {
    const f = $('#tpl-form').elements;
    try {
      await C.api('POST', '/api/templates', { title: f.title.value, icon: f.icon.value, archetype: f.archetype.value, prompt: f.prompt.value });
      C.toast('📜 Vorlage gespeichert');
      openQuests();
    } catch (err) { C.toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------- Schichtplan
async function openSchedules() {
  const list = await C.api('GET', '/api/schedules');
  const esc = C.esc;
  const fmtNext = (ts) => (ts ? new Date(ts).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
  C.openModal(`
    <div class="modal-head"><h2>🗓️ Schichtplan</h2><button class="btn btn-sm" id="sch-new">＋ Neue Schicht</button><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-intro">Wiederkehrende Aufträge zu festen Zeiten – z. B. jeden Morgen um 8 Uhr ein Briefing. Läuft, solange der Agent Store geöffnet ist; verpasste Schichten des Tages werden beim Start nachgeholt.</p>
      ${list.length ? `<div class="sch-list">${list.map((s) => {
        const a = C.S.agents.get(s.agentId);
        return `<div class="sch-row ${s.enabled ? '' : 'off'}">
          <div class="sch-time">${esc(s.time)}</div>
          <div class="sch-main">
            <div class="sch-title">${esc(s.title)}</div>
            <div class="sch-sub">${a ? `${esc(a.avatar)} ${esc(a.name)}` : '⚠️ Agent fehlt'} · ${esc(s.dayNames.join(', '))}${s.projectId ? ` · ${esc(projectLabel(s.projectId))}` : ''}</div>
            <div class="sch-sub">Nächster Lauf: ${esc(fmtNext(s.next))} · bisher ${s.runs || 0}×</div>
          </div>
          <label class="toggle" title="Aktiv"><input type="checkbox" data-toggle="${esc(s.id)}" ${s.enabled ? 'checked' : ''}></label>
          <button class="btn btn-sm" data-run="${esc(s.id)}" title="Jetzt ausführen">▶</button>
          <button class="btn btn-sm" data-edit="${esc(s.id)}" title="Bearbeiten">✏️</button>
          <button class="btn btn-sm btn-danger" data-del="${esc(s.id)}" title="Löschen">🗑</button>
        </div>`;
      }).join('')}</div>` : '<div class="empty-note">Noch keine Schichten geplant.</div>'}
    </div>`);
  $('#sch-new').onclick = () => openScheduleForm();
  const card = $('#modal-card');
  card.querySelectorAll('[data-toggle]').forEach((el) => (el.onchange = async () => {
    try { await C.api('PATCH', `/api/schedules/${el.dataset.toggle}`, { enabled: el.checked }); openSchedules(); } catch (err) { C.toast(err.message, 'error'); }
  }));
  card.querySelectorAll('[data-run]').forEach((el) => (el.onclick = async () => {
    try { await C.api('POST', `/api/schedules/${el.dataset.run}/run-now`); C.toast('▶ Schicht gestartet'); } catch (err) { C.toast(err.message, 'error'); }
  }));
  card.querySelectorAll('[data-edit]').forEach((el) => (el.onclick = () => openScheduleForm(list.find((s) => s.id === el.dataset.edit))));
  card.querySelectorAll('[data-del]').forEach((el) => (el.onclick = async () => {
    if (!confirm('Schicht löschen?')) return;
    try { await C.api('DELETE', `/api/schedules/${el.dataset.del}`); openSchedules(); } catch (err) { C.toast(err.message, 'error'); }
  }));
}

async function openScheduleForm(s = null) {
  if (needAgents()) return;
  const esc = C.esc;
  const templates = await C.api('GET', '/api/templates');
  const days = s?.days || [1, 2, 3, 4, 5];
  C.openModal(`
    <div class="modal-head"><h2>${s ? '✏️ Schicht bearbeiten' : '＋ Neue Schicht'}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="sch-form" autocomplete="off">
        <div class="row2">
          <div class="field"><label>Titel</label><input name="title" maxlength="60" value="${esc(s?.title || '')}" placeholder="z. B. Morgenbriefing"></div>
          <div class="field"><label>Uhrzeit</label><input name="time" type="time" value="${esc(s?.time || '08:00')}"></div>
        </div>
        <div class="field"><label>Wochentage</label><div class="day-picks">${DAYS.map(([d, n]) => `<label><input type="checkbox" name="day" value="${d}" ${days.includes(d) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
        <div class="row2">
          <div class="field"><label>Agent</label><select name="agentId">${agentOptions(s?.agentId)}</select></div>
          <div class="field"><label>Projekt</label><select name="projectId">${projectOptions(s ? s.projectId : C.S.game.activeProjectId)}</select></div>
        </div>
        <div class="field"><label>Vorlage übernehmen (optional)</label><select id="sch-tpl"><option value="">–</option>${templates.map((t) => `<option value="${esc(t.id)}">${esc(t.icon)} ${esc(t.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Auftrag</label><textarea name="prompt" rows="6" placeholder="Fasse die wichtigsten News zu … zusammen.">${esc(s?.prompt || '')}</textarea></div>
        <label class="toggle"><input type="checkbox" name="enabled" ${s?.enabled === false ? '' : 'checked'}> Aktiv</label>
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="sch-back">← Zurück</button><button class="btn btn-gold" id="sch-save">💾 Speichern</button></div>`, { narrow: true });
  const f = $('#sch-form').elements;
  $('#sch-tpl').onchange = (e) => {
    const t = templates.find((x) => x.id === e.target.value);
    if (!t) return;
    f.prompt.value = t.prompt;
    if (!f.title.value) f.title.value = t.title;
    if (t.archetype) {
      const a = agentsSorted().find((x) => x.archetype === t.archetype);
      if (a) f.agentId.value = a.id;
    }
  };
  $('#sch-back').onclick = openSchedules;
  $('#sch-save').onclick = async () => {
    const body = {
      title: f.title.value,
      time: f.time.value,
      days: [...$('#sch-form').querySelectorAll('input[name="day"]:checked')].map((x) => Number(x.value)),
      agentId: f.agentId.value,
      projectId: f.projectId.value || null,
      prompt: f.prompt.value,
      enabled: f.enabled.checked,
    };
    try {
      if (s) await C.api('PATCH', `/api/schedules/${s.id}`, body);
      else await C.api('POST', '/api/schedules', body);
      C.toast('🗓️ Schicht gespeichert');
      openSchedules();
    } catch (err) { C.toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------- Projekte & Archiv
let archiveView = { projectId: 'all', q: '', agentId: '' };

async function openProjects(projectId) {
  if (projectId !== undefined) archiveView = { projectId, q: '', agentId: '' };
  C.S.projects = await C.api('GET', '/api/projects');
  if (!['all', 'none'].includes(archiveView.projectId) && !C.S.projects.some((p) => p.id === archiveView.projectId)) archiveView.projectId = 'all';
  const esc = C.esc;
  const projects = C.S.projects;
  const sel = archiveView.projectId;
  const current = projects.find((p) => p.id === sel);
  const nav = [
    { id: 'all', icon: '🗄️', name: 'Alle Ergebnisse' },
    { id: 'none', icon: '📄', name: 'Ohne Projekt' },
    ...projects,
  ];
  C.openModal(`
    <div class="modal-head"><h2>📁 Projekte & Archiv</h2><button class="btn btn-sm" id="prj-new">＋ Neues Projekt</button><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body prj-layout">
      <nav class="prj-nav">${nav.map((p) => `
        <button class="prj-item ${p.id === sel ? 'on' : ''}" data-prj="${esc(p.id)}" ${p.color ? `style="--c:${esc(p.color)}"` : ''}>
          <span>${esc(p.icon)}</span><span class="prj-name">${esc(p.name)}</span>
          ${p.id === C.S.game.activeProjectId ? '<span class="prj-active" title="Aktives Projekt">★</span>' : ''}
          ${typeof p.results === 'number' ? `<span class="prj-count">${p.results}</span>` : ''}
        </button>`).join('')}
      </nav>
      <section class="prj-main">
        ${current ? `
          <div class="prj-head">
            <div><h3>${esc(current.icon)} ${esc(current.name)}</h3>
              ${current.description ? `<div class="prj-desc">${esc(current.description)}</div>` : ''}
              <div class="prj-path" title="Gemeinsamer Projektordner">📂 ${esc(current.path)}</div></div>
            <div class="prj-actions">
              ${current.id === C.S.game.activeProjectId ? '<span class="chip">★ aktiv</span>' : '<button class="btn btn-sm" id="prj-activate">★ Aktiv setzen</button>'}
              <button class="btn btn-sm" id="prj-folder">📂 Ordner</button>
              <button class="btn btn-sm" id="prj-edit">✏️</button>
              <button class="btn btn-sm btn-danger" id="prj-del">🗑</button>
            </div>
          </div>` : `<div class="prj-head"><h3>${sel === 'none' ? '📄 Ergebnisse ohne Projekt' : '🗄️ Alle Ergebnisse'}</h3></div>`}
        <div class="arch-tools">
          <input id="arch-q" placeholder="🔎 Volltextsuche in Aufträgen und Ergebnissen…" value="${esc(archiveView.q)}">
          <select id="arch-agent"><option value="">Alle Agents</option>${agentsSorted().map((a) => `<option value="${esc(a.id)}" ${a.id === archiveView.agentId ? 'selected' : ''}>${esc(a.avatar)} ${esc(a.name)}</option>`).join('')}</select>
          ${sel !== 'none' ? `<a class="btn btn-sm" href="/api/projects/${esc(sel)}/export" download>⬇ Markdown</a><a class="btn btn-sm" href="/print.html?project=${esc(sel)}" target="_blank" rel="noopener">🖨 PDF</a>` : ''}
        </div>
        <div class="arch-list" id="arch-list"><div class="empty-note">lädt…</div></div>
      </section>
    </div>`);
  const card = $('#modal-card');
  $('#modal-card').classList.add('wide');
  card.querySelectorAll('[data-prj]').forEach((b) => (b.onclick = () => openProjects(b.dataset.prj)));
  $('#prj-new').onclick = () => openProjectForm();
  if (current) {
    $('#prj-activate')?.addEventListener('click', async () => { await C.api('PUT', '/api/active-project', { projectId: current.id }); C.S.game.activeProjectId = current.id; openProjects(); });
    $('#prj-folder').onclick = () => C.api('POST', `/api/projects/${current.id}/open-folder`).catch((e) => C.toast(e.message, 'error'));
    $('#prj-edit').onclick = () => openProjectForm(current);
    $('#prj-del').onclick = async () => {
      if (!confirm(`Projekt „${current.name}“ löschen? Ergebnisse bleiben im Archiv, der Ordner bleibt auf der Festplatte.`)) return;
      try { await C.api('DELETE', `/api/projects/${current.id}`); openProjects('all'); } catch (e) { C.toast(e.message, 'error'); }
    };
  }
  let timer = null;
  $('#arch-q').oninput = (e) => { archiveView.q = e.target.value; clearTimeout(timer); timer = setTimeout(loadArchive, 250); };
  $('#arch-agent').onchange = (e) => { archiveView.agentId = e.target.value; loadArchive(); };
  loadArchive();
}

async function loadArchive() {
  const esc = C.esc;
  const el = $('#arch-list');
  if (!el) return;
  const params = new URLSearchParams({ projectId: archiveView.projectId === 'all' ? '' : archiveView.projectId, q: archiveView.q, agentId: archiveView.agentId, limit: '300' });
  try {
    const items = await C.api('GET', '/api/archive?' + params);
    if (!$('#arch-list')) return;
    el.innerHTML = items.length ? items.map((e) => `
      <details class="arch-item">
        <summary>
          <span class="arch-who">${esc(e.agentAvatar || '')} ${esc(e.agentName)}</span>
          <span class="arch-prompt">${esc(e.prompt.split('\n')[0].slice(0, 140))}</span>
          ${typeof e.score === 'number' ? `<span class="chip score">🧐 ${e.score}/10</span>` : ''}
          ${e.projectId && archiveView.projectId === 'all' ? `<span class="chip">${esc(projectLabel(e.projectId))}</span>` : ''}
          <span class="arch-when">${esc(new Date(e.ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span>
        </summary>
        <div class="arch-body bubble">${C.renderMarkdown(e.text)}</div>
        <div class="arch-foot"><button class="btn btn-sm" data-copy-arch="${esc(e.id)}">📋 kopieren</button><span>${esc(e.providerLabel || e.provider)}${e.model ? ' · ' + esc(e.model) : ''}${e.durationMs ? ' · ⏱ ' + esc(C.fmtDuration(e.durationMs)) : ''}</span></div>
      </details>`).join('') : '<div class="empty-note">Keine Ergebnisse gefunden.</div>';
    el.querySelectorAll('[data-copy-arch]').forEach((b) => (b.onclick = async () => {
      const item = items.find((x) => x.id === b.dataset.copyArch);
      await navigator.clipboard.writeText(item.text);
      b.textContent = '✓ kopiert';
    }));
  } catch (err) { el.innerHTML = `<div class="empty-note">${esc(err.message)}</div>`; }
}

function openProjectForm(p = null) {
  const esc = C.esc;
  C.openModal(`
    <div class="modal-head"><h2>${p ? '✏️ Projekt bearbeiten' : '＋ Neues Projekt'}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="prj-form" autocomplete="off">
        <div class="field"><label>Name</label><input name="name" maxlength="60" value="${esc(p?.name || '')}" placeholder="z. B. Etsy-Shop"></div>
        <div class="field"><label>Symbol</label><div class="avatar-grid" id="prj-icons">${C.S.projectIcons.map((i) => `<button type="button" data-i="${esc(i)}" class="${(p?.icon || '📁') === i ? 'on' : ''}">${esc(i)}</button>`).join('')}</div></div>
        <div class="row2">
          <div class="field"><label>Farbe</label><input name="color" type="color" value="${esc(p?.color || '#60a5fa')}"></div>
          <div class="field"><label>Eigener Projektordner (optional)</label><input name="folder" value="${esc(p?.folder || '')}" placeholder="leer = automatisch im Agent Store"></div>
        </div>
        <div class="field"><label>Beschreibung / Kontext für die Agents</label><textarea name="description" rows="3" placeholder="z. B. Handgemachte Keramik, Zielgruppe 25–45, warmer Ton">${esc(p?.description || '')}</textarea></div>
        ${p ? '' : '<label class="toggle"><input type="checkbox" name="activate" checked> Als aktives Projekt setzen</label>'}
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="prj-back">← Zurück</button><button class="btn btn-gold" id="prj-save">💾 Speichern</button></div>`, { narrow: true });
  let icon = p?.icon || '📁';
  $('#prj-icons').onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    icon = b.dataset.i;
    $('#prj-icons').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
  $('#prj-back').onclick = () => openProjects();
  $('#prj-save').onclick = async () => {
    const f = $('#prj-form').elements;
    const body = { name: f.name.value, icon, color: f.color.value, folder: f.folder.value, description: f.description.value, activate: f.activate?.checked };
    try {
      const saved = p ? await C.api('PATCH', `/api/projects/${p.id}`, body) : await C.api('POST', '/api/projects', body);
      if (body.activate) C.S.game.activeProjectId = saved.id;
      C.toast('📁 Projekt gespeichert');
      openProjects(saved.id);
    } catch (err) { C.toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------- Erfolge
async function openAchievements() {
  const prog = await C.api('GET', '/api/progress');
  const esc = C.esc;
  const done = prog.achievements.filter((a) => a.unlockedAt).length;
  C.openModal(`
    <div class="modal-head"><h2>🏆 Erfolge · ${done}/${prog.achievements.length}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <div class="ach-grid">${prog.achievements.map((a) => `
        <div class="ach ${a.unlockedAt ? 'on' : ''}">
          <div class="ach-icon">${esc(a.icon)}</div>
          <div class="ach-main">
            <div class="ach-title">${esc(a.title)} <span class="ach-reward">+${a.reward} 🪙</span></div>
            <div class="ach-desc">${esc(a.desc)}</div>
            <div class="ach-bar"><div style="width:${Math.round((a.progress / a.goal) * 100)}%"></div></div>
            <div class="ach-prog">${a.unlockedAt ? `Freigeschaltet am ${esc(new Date(a.unlockedAt).toLocaleDateString('de-DE'))}` : `${a.progress} / ${a.goal}`}</div>
          </div>
        </div>`).join('')}
      </div>
      <div class="section-title">TALENTE (PRO AGENT, NACH LEVEL)</div>
      <div class="talent-list">${prog.talents.map((t) => `<div class="talent"><span class="t-lvl">LV ${t.level}</span><span>${esc(t.icon)} <b>${esc(t.title)}</b> – ${esc(t.desc)}</span></div>`).join('')}</div>
    </div>`);
}

// ---------------------------------------------------------------- Statistik
async function openStats() {
  const st = await C.api('GET', '/api/stats');
  const esc = C.esc;
  const t = st.totals;
  const dur = (ms) => (ms ? C.fmtDuration(ms) : '–');
  const usd = (v) => (typeof v === 'number' ? `$${v.toFixed(3)}` : '–');
  const best = (list, key, dir) => list.filter((x) => x[key] != null).sort((a, b) => (a[key] - b[key]) * dir)[0];
  const fastest = best(st.models, 'avgDurationMs', 1);
  const cheapest = best(st.models, 'avgCostUsd', 1);
  const popular = st.models[0];
  const bestScore = best(st.agents, 'avgScore', -1);
  const table = (title, rows) => {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return `<div class="section-title">${esc(title)}</div>
      ${rows.length ? `<div class="stat-wrap"><table class="stat-table"><thead><tr><th></th><th>Ergebnisse</th><th>Ø Dauer</th><th>Ø Kosten*</th><th>Ø Prüfnote</th></tr></thead><tbody>${rows.map((r) => `
        <tr><td>${esc(r.label)}</td>
          <td><div class="bar-cell"><div class="bar" style="width:${Math.round((r.count / max) * 100)}%"></div><span>${r.count}</span></div></td>
          <td>${esc(dur(r.avgDurationMs))}</td><td>${esc(usd(r.avgCostUsd))}</td><td>${r.avgScore != null ? r.avgScore + '/10' : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-note">Noch keine Daten.</div>'}`;
  };
  C.openModal(`
    <div class="modal-head"><h2>📊 Statistik</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <div class="tiles">
        <div class="tile"><b>${t.totalQuests}</b><span>Aufträge</span></div>
        <div class="tile"><b>${t.totalCoinsEarned}</b><span>🪙 verdient</span></div>
        <div class="tile"><b>${t.handoffs || 0}</b><span>Übergaben</span></div>
        <div class="tile"><b>${t.chains || 0}</b><span>Ketten fertig</span></div>
        <div class="tile"><b>${t.duels || 0}</b><span>Duelle</span></div>
        <div class="tile"><b>${Math.round(t.morale * 100)}%</b><span>Team-Moral</span></div>
      </div>
      <div class="highlights">
        <div>⚡ <b>Schnellstes Modell:</b> ${fastest ? `${esc(fastest.label)} (Ø ${esc(dur(fastest.avgDurationMs))})` : '–'}</div>
        <div>💸 <b>Günstigstes Modell:</b> ${cheapest ? `${esc(cheapest.label)} (Ø ${esc(usd(cheapest.avgCostUsd))})` : '–'}</div>
        <div>❤️ <b>Beliebtestes Modell:</b> ${popular ? `${esc(popular.label)} (${popular.count}×)` : '–'}</div>
        <div>🎯 <b>Beste Prüfnoten:</b> ${bestScore ? `${esc(bestScore.label)} (Ø ${bestScore.avgScore}/10)` : '–'}</div>
      </div>
      ${table('PRO AGENT', st.agents)}
      ${table('PRO ANTRIEB', st.providers)}
      ${table('PRO MODELL', st.models)}
      <p class="help" style="font-size:11.5px;color:var(--dim)">* Kosten nur, wo der Antrieb sie meldet (Claude Code liefert einen API-Gegenwert – im Abo zahlst du ihn nicht extra).</p>
    </div>`);
}

// ---------------------------------------------------------------- Büro-Upgrades (Tab im Store)
export async function renderUpgrades(container) {
  const prog = await C.api('GET', '/api/progress');
  const esc = C.esc;
  container.innerHTML = `
    <p class="muted-intro">Upgrades gelten fürs ganze Hauptquartier und erscheinen in jedem Pixel-Büro. Jedes Upgrade hebt die <b>Team-Moral um 3 %</b> – das gibt mehr Münzen pro Auftrag. Aktuelle Moral: <b>${Math.round(prog.morale * 100)} %</b>.</p>
    <div class="store-grid">${prog.upgrades.map((u) => `
      <div class="card ${u.owned ? 'owned' : ''}">
        <div class="top"><span class="big">${esc(u.icon)}</span><div><h3>${esc(u.title)}</h3><div class="rar ${u.owned ? 'rar-legendary' : 'rar-common'}">${u.owned ? 'Gekauft' : 'Upgrade'}</div></div></div>
        <p>${esc(u.desc)}</p>
        <button class="btn ${!u.owned && C.S.game.coins >= u.cost ? 'btn-gold' : ''}" data-buy="${esc(u.id)}" ${u.owned || C.S.game.coins < u.cost ? 'disabled' : ''}>
          ${u.owned ? '✓ Im Büro' : `Kaufen · <span class="price">${u.cost} 🪙</span>`}
        </button>
      </div>`).join('')}
    </div>`;
  container.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      await C.api('POST', `/api/upgrades/${b.dataset.buy}/buy`);
      setTimeout(() => renderUpgrades(container), 150);
    } catch (err) { C.toast(err.message, 'error'); b.disabled = false; }
  }));
}
