// Zusatzfenster: Quest-Board, Schichtplan, Projekte & Archiv, Erfolge, Statistik, Büro-Upgrades.
let C = null; // Kontext aus app.js (State, API, Modal, Helfer)

export function initPanels(ctx) {
  C = ctx;
  return {
    openQuests, openSchedules, openProjects, openAchievements, openStats, renderUpgrades, projectOptions, projectLabel,
    openProfiles, openPlanner, openPlanBulk, openInbox, openConvert, profileOptions, profileParam,
  };
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

// ---------------------------------------------------------------- Quest-Board (Vorlagen-Pakete)
let questCategory = '';

function categoryLabel(id) {
  const c = C.S.templateCategories.find((x) => x.id === id);
  return c ? `${c.icon} ${c.title}` : id;
}

export function profileOptions(selected, { none = 'Kein Profil', projectDefault = false } = {}) {
  const esc = C.esc;
  return (projectDefault ? ['<option value="__default">Standard des Projekts</option>'] : [])
    .concat([`<option value="">${esc(none)}</option>`])
    .concat(C.S.profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.icon)} ${esc(p.name)}</option>`))
    .join('');
}

// Wert eines Profil-Selects in API-Parameter übersetzen (undefined = Projekt-Standard).
export function profileParam(value) {
  return value === '__default' ? undefined : value || null;
}

async function openQuests() {
  const list = await C.api('GET', '/api/templates');
  const esc = C.esc;
  const arch = (id) => C.S.catalog.find((c) => c.id === id);
  const counts = Object.fromEntries(C.S.templateCategories.map((c) => [c.id, list.filter((t) => t.category === c.id).length]));
  const shown = list.filter((t) => !questCategory || t.category === questCategory);
  C.openModal(`
    <div class="modal-head"><h2>📜 Quest-Board</h2>
      <button class="btn btn-sm" id="tpl-import" title="Vorlagen-Paket (JSON) importieren">⬆ Import</button>
      <a class="btn btn-sm" href="/api/templates/export${questCategory ? `?category=${esc(questCategory)}` : ''}" download title="Eigene Vorlagen als JSON exportieren">⬇ Export</a>
      <button class="btn btn-sm" id="tpl-new">＋ Eigene Vorlage</button>
      <button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-intro">Fertige Aufträge zum Anklicken – Felder ausfüllen, Agent wählen, los. Vorlagen mit <b>Abschnitten</b> liefern feste Teile (z. B. CAPTION / HASHTAGS), die du im 📥 Postfach einzeln kopieren kannst.</p>
      <div class="cat-filter">
        <button class="chip-btn ${questCategory ? '' : 'on'}" data-cat="">Alle · ${list.length}</button>
        ${C.S.templateCategories.filter((c) => counts[c.id]).map((c) => `<button class="chip-btn ${questCategory === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.icon)} ${esc(c.title)} · ${counts[c.id]}</button>`).join('')}
      </div>
      <div class="quest-grid">${shown.map((t) => `
        <button class="quest-card" data-tpl="${esc(t.id)}" style="--c:${esc(arch(t.archetype)?.color || '#60a5fa')}">
          <span class="q-icon">${esc(t.icon)}</span>
          <span class="q-title">${esc(t.title)}</span>
          <span class="q-meta">${esc(categoryLabel(t.category))}${arch(t.archetype) ? ` · ideal: ${esc(arch(t.archetype).avatar)} ${esc(arch(t.archetype).title)}` : ''}</span>
          <span class="q-fields">${t.fields.map((f) => `<i>${esc(f)}</i>`).join('')}${t.structure.length ? `<i class="q-struct" title="Feste Abschnitte">▤ ${esc(t.structure.join(' · '))}</i>` : ''}</span>
          ${t.builtin ? '' : `<span class="q-del" data-del="${esc(t.id)}" title="Vorlage löschen">🗑</span>`}
        </button>`).join('') || '<div class="empty-note">Keine Vorlagen in dieser Kategorie.</div>'}
      </div>
      <input type="file" id="tpl-file" accept=".json,application/json" hidden>
    </div>`);
  $('#tpl-new').onclick = () => openTemplateEditor();
  $('#tpl-import').onclick = () => $('#tpl-file').click();
  $('#tpl-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await C.api('POST', '/api/templates/import', JSON.parse(await file.text()));
      C.toast(`⬆ ${r.added} Vorlagen importiert${r.skipped ? `, ${r.skipped} übersprungen` : ''}`);
      openQuests();
    } catch (err) { C.toast('Import fehlgeschlagen: ' + err.message, 'error'); }
  };
  $('#modal-card').querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { questCategory = b.dataset.cat; openQuests(); }));
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
  const long = (f) => /text|email|inhalt|code|notizen|idee/i.test(f);
  C.openModal(`
    <div class="modal-head"><h2>${esc(t.icon)} ${esc(t.title)}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="quest-form" autocomplete="off">
        ${t.fields.map((f) => `<div class="field"><label>${esc(f[0].toUpperCase() + f.slice(1))}</label>${long(f)
          ? `<textarea name="${esc(f)}" rows="5"></textarea>`
          : `<input name="${esc(f)}">`}</div>`).join('')}
        <div class="field"><label>Agent</label><select name="agentId">${agentOptions(null, t.archetype)}</select>
          <div class="help">Hat der Agent eine 🔗 Kette, läuft sie automatisch weiter.</div></div>
        <div class="row2">
          <div class="field"><label>Projekt</label><select name="projectId">${projectOptions(C.S.game.activeProjectId)}</select></div>
          <div class="field"><label>Kontext-Profil</label><select name="profileId">${profileOptions(null, { projectDefault: true })}</select></div>
        </div>
        ${t.structure.length ? `<div class="help">▤ Antwort kommt in Abschnitten: <b>${esc(t.structure.join(' · '))}</b>${t.limits ? ` · Limit: ${t.limits.maxChars ? `${t.limits.maxChars} Zeichen${t.limits.section ? ` (${esc(t.limits.section)})` : ''}` : ''}${t.limits.maxHashtags ? ` · max. ${t.limits.maxHashtags} Hashtags` : ''}` : ''}</div>` : ''}
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
      await C.api('POST', `/api/templates/${t.id}/run`, {
        agentId: form.elements.agentId.value,
        values: values(),
        projectId: form.elements.projectId.value || null,
        profileId: profileParam(form.elements.profileId.value),
      });
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
        <div class="row2">
          <div class="field"><label>Kategorie</label><select name="category">${C.S.templateCategories.map((c) => `<option value="${esc(c.id)}" ${c.id === (questCategory || 'custom') ? 'selected' : ''}>${esc(c.icon)} ${esc(c.title)}</option>`).join('')}</select></div>
          <div class="field"><label>Ideale Agent-Klasse</label><select name="archetype"><option value="">– egal –</option>${C.S.catalog.map((c) => `<option value="${esc(c.id)}">${esc(c.avatar)} ${esc(c.title)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Auftragstext</label><textarea name="prompt" rows="6" placeholder="Fasse die wichtigsten Punkte zu {{thema}} für {{zielgruppe}} zusammen."></textarea>
          <div class="help">Alles in <code>{{doppelten Klammern}}</code> wird beim Starten als Feld abgefragt.</div></div>
        <div class="field"><label>Abschnitte der Antwort (optional)</label><input name="structure" placeholder="z. B. BETREFF, TEXT  oder  CAPTION, HASHTAGS, BILD-PROMPT">
          <div class="help">Kommagetrennt. Der Agent gliedert seine Antwort dann genau so – im Postfach bekommt jeder Abschnitt einen eigenen Kopier-Knopf.</div></div>
        <div class="row2">
          <div class="field"><label>Max. Zeichen (optional)</label><input name="maxChars" type="number" min="1" placeholder="z. B. 2200"></div>
          <div class="field"><label>Max. Hashtags (optional)</label><input name="maxHashtags" type="number" min="1" placeholder="z. B. 5"></div>
        </div>
        <div class="field"><label>Zeichenlimit gilt für Abschnitt (optional)</label><input name="limitSection" placeholder="z. B. CAPTION – leer = ganze Antwort"></div>
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="tpl-back">← Zurück</button><button class="btn btn-gold" id="tpl-save">💾 Vorlage speichern</button></div>`, { narrow: true });
  $('#tpl-back').onclick = openQuests;
  $('#tpl-save').onclick = async () => {
    const f = $('#tpl-form').elements;
    try {
      await C.api('POST', '/api/templates', {
        title: f.title.value, icon: f.icon.value, archetype: f.archetype.value, prompt: f.prompt.value,
        category: f.category.value,
        structure: f.structure.value,
        limits: { maxChars: f.maxChars.value, maxHashtags: f.maxHashtags.value, section: f.limitSection.value },
      });
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
        <div class="arch-foot"><button class="btn btn-sm" data-copy-arch="${esc(e.id)}">📋 kopieren</button><button class="btn btn-sm" data-convert-arch="${esc(e.id)}">♻️ Umwandeln</button><button class="btn btn-sm" data-plan-arch="${esc(e.id)}" title="Themenliste aus diesem Ergebnis in den Planer übernehmen">📅 In Planer</button><span>${esc(e.providerLabel || e.provider)}${e.model ? ' · ' + esc(e.model) : ''}${e.durationMs ? ' · ⏱ ' + esc(C.fmtDuration(e.durationMs)) : ''}</span></div>
      </details>`).join('') : '<div class="empty-note">Keine Ergebnisse gefunden.</div>';
    el.querySelectorAll('[data-convert-arch]').forEach((b) => (b.onclick = () => {
      const item = items.find((x) => x.id === b.dataset.convertArch);
      openConvert({ sourceId: item.id, agentId: item.agentId });
    }));
    el.querySelectorAll('[data-plan-arch]').forEach((b) => (b.onclick = () => {
      const item = items.find((x) => x.id === b.dataset.planArch);
      const lines = (item.finalText || item.text).split('\n').filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l)).join('\n');
      openPlanBulk(lines || item.text.split('\n').filter((l) => l.trim()).slice(0, 15).join('\n'));
    }));
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
        <div class="field"><label>Standard-Kontext-Profil</label><select name="profileId">${profileOptions(p?.profileId)}</select>
          <div class="help">Wird allen Aufträgen in diesem Projekt vorangestellt (pro Auftrag änderbar). Profile verwaltest du unter 🏢 Profile.</div></div>
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
    const body = { name: f.name.value, icon, color: f.color.value, folder: f.folder.value, description: f.description.value, profileId: f.profileId.value || null, activate: f.activate?.checked };
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

// ---------------------------------------------------------------- Kontext-Profile
async function openProfiles() {
  C.S.profiles = await C.api('GET', '/api/profiles');
  const esc = C.esc;
  const usedBy = (id) => C.S.projects.filter((p) => p.profileId === id).map((p) => `${p.icon} ${p.name}`);
  C.openModal(`
    <div class="modal-head"><h2>🏢 Kontext-Profile</h2><button class="btn btn-sm" id="prof-new">＋ Neues Profil</button><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-intro">Ein Profil ist Hintergrundwissen, das einem Auftrag automatisch vorangestellt wird – z. B. „Meine Firma“, „Etsy-Shop“ oder „Social Media“. Jedes Projekt kann ein Standard-Profil haben; pro Auftrag kannst du ein anderes oder keins wählen. Aus deinem Feedback im 📥 Postfach lernt das Profil Vorlieben dazu.</p>
      ${C.S.profiles.length ? `<div class="prof-grid">${C.S.profiles.map((p) => `
        <div class="prof-card">
          <div class="prof-head"><span class="prof-icon">${esc(p.icon)}</span><div><b>${esc(p.name)}</b><div class="prof-sub">${esc(p.purpose || 'Kein Zweck angegeben')}</div></div></div>
          <div class="prof-meta">
            ${p.audience ? `<span>🎯 ${esc(p.audience.slice(0, 60))}</span>` : ''}
            ${p.tone ? `<span>🎙️ ${esc(p.tone.slice(0, 60))}</span>` : ''}
            <span>💡 ${p.prefs?.length || 0} gelernte Vorlieben</span>
            ${usedBy(p.id).length ? `<span>📁 Standard für: ${esc(usedBy(p.id).join(', '))}</span>` : ''}
          </div>
          <div class="prof-actions"><button class="btn btn-sm" data-edit="${esc(p.id)}">✏️ Bearbeiten</button><button class="btn btn-sm btn-danger" data-del="${esc(p.id)}">🗑</button></div>
        </div>`).join('')}</div>` : '<div class="empty-note">Noch keine Profile – leg z. B. „Meine Firma“ an.</div>'}
    </div>`);
  $('#prof-new').onclick = () => openProfileForm();
  const card = $('#modal-card');
  card.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProfileForm(C.S.profiles.find((p) => p.id === b.dataset.edit))));
  card.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Profil löschen? Projekte, die es als Standard nutzen, haben danach kein Profil mehr.')) return;
    try { await C.api('DELETE', `/api/profiles/${b.dataset.del}`); openProfiles(); } catch (err) { C.toast(err.message, 'error'); }
  }));
}

function openProfileForm(p = null) {
  const esc = C.esc;
  const ta = (name, label, rows, placeholder, value, help = '') => `<div class="field"><label>${label}</label><textarea name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea>${help ? `<div class="help">${help}</div>` : ''}</div>`;
  C.openModal(`
    <div class="modal-head"><h2>${p ? '✏️ Profil bearbeiten' : '＋ Neues Profil'}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="prof-form" autocomplete="off">
        <div class="row2">
          <div class="field"><label>Name</label><input name="name" maxlength="60" value="${esc(p?.name || '')}" placeholder="z. B. Meine Firma"></div>
          <div class="field"><label>Symbol</label><input name="icon" maxlength="4" value="${esc(p?.icon || '🏢')}"></div>
        </div>
        ${ta('purpose', 'Zweck / Ziel', 2, 'z. B. Handgemachte Keramik online verkaufen, Fokus Etsy', p?.purpose)}
        ${ta('offer', 'Angebot', 2, 'Produkte/Leistungen, Preisrahmen, Besonderheiten', p?.offer)}
        ${ta('audience', 'Zielgruppe', 2, 'z. B. Frauen 25–45, kreativ, legen Wert auf Nachhaltigkeit', p?.audience)}
        ${ta('tone', 'Ton / Stil', 2, 'z. B. warm, persönlich, Du-Form, Emojis sparsam', p?.tone)}
        ${ta('rules', 'Regeln & No-Gos', 2, 'z. B. keine Superlative, keine Rabatt-Versprechen, max. 5 Hashtags', p?.rules)}
        ${ta('examples', 'Beispiele, die dir gefallen', 4, 'Beispieltexte – mehrere mit einer Zeile --- trennen', (p?.examples || []).join('\n---\n'), 'Mehrere Beispiele mit einer Zeile <code>---</code> trennen.')}
        ${ta('prefs', '💡 Gelernte Vorlieben', 4, 'Entstehen aus deinem Feedback im Postfach – eine pro Zeile, frei bearbeitbar', (p?.prefs || []).join('\n'), 'Eine pro Zeile. Die neuesten 15 werden den Agents mitgegeben.')}
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="prof-back">← Zurück</button><button class="btn btn-gold" id="prof-save">💾 Speichern</button></div>`, { narrow: true });
  $('#prof-back').onclick = openProfiles;
  $('#prof-save').onclick = async () => {
    const f = $('#prof-form').elements;
    const body = {
      name: f.name.value, icon: f.icon.value, purpose: f.purpose.value, offer: f.offer.value, audience: f.audience.value,
      tone: f.tone.value, rules: f.rules.value,
      examples: f.examples.value.split(/\n\s*---\s*\n/).map((x) => x.trim()).filter(Boolean),
      prefs: f.prefs.value.split('\n').map((x) => x.trim()).filter(Boolean),
    };
    try {
      if (p) await C.api('PATCH', `/api/profiles/${p.id}`, body); else await C.api('POST', '/api/profiles', body);
      C.toast('🏢 Profil gespeichert');
      openProfiles();
    } catch (err) { C.toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------- Planer
const STATUS = { idee: '💭 Idee', entwurf: '📝 Entwurf', freigegeben: '✅ Freigegeben', erledigt: '✔ Erledigt' };
let planView = { mode: 'week', anchor: null };

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

function planRange() {
  const a = planView.anchor ? parseYmd(planView.anchor) : new Date();
  if (planView.mode === 'week') {
    const start = mondayOf(a);
    return { start, days: Array.from({ length: 7 }, (_, i) => addDays(start, i)), title: `Woche ab ${start.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}` };
  }
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const start = mondayOf(first);
  return { start, days: Array.from({ length: 42 }, (_, i) => addDays(start, i)), month: a.getMonth(), title: first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) };
}

async function openPlanner() {
  const esc = C.esc;
  const r = planRange();
  const items = await C.api('GET', `/api/plan?from=${ymd(r.days[0])}&to=${ymd(r.days[r.days.length - 1])}`);
  const today = ymd(new Date());
  const byDay = (d) => items.filter((it) => it.date === ymd(d));
  const agentName = (id) => { const a = C.S.agents.get(id); return a ? `${a.avatar} ${a.name}` : ''; };
  C.openModal(`
    <div class="modal-head"><h2>📅 Planer</h2>
      <button class="btn btn-sm" id="plan-bulk">☰ Mehrere planen</button>
      <button class="btn btn-sm" id="plan-new">＋ Eintrag</button>
      <button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <div class="plan-bar">
        <button class="btn btn-sm" id="plan-prev">◀</button>
        <button class="btn btn-sm" id="plan-today">Heute</button>
        <button class="btn btn-sm" id="plan-next">▶</button>
        <b class="plan-title">${esc(r.title)}</b>
        <span class="spacer"></span>
        <div class="seg"><button class="${planView.mode === 'week' ? 'on' : ''}" data-mode="week">Woche</button><button class="${planView.mode === 'month' ? 'on' : ''}" data-mode="month">Monat</button></div>
      </div>
      <div class="plan-grid ${planView.mode}">
        ${planView.mode === 'month' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="plan-dow">${d}</div>`).join('') : ''}
        ${r.days.map((d) => `
          <div class="plan-day ${ymd(d) === today ? 'today' : ''} ${r.month !== undefined && d.getMonth() !== r.month ? 'other' : ''}" data-day="${ymd(d)}">
            <div class="plan-date">${d.toLocaleDateString('de-DE', planView.mode === 'week' ? { weekday: 'short', day: '2-digit', month: '2-digit' } : { day: 'numeric' })}<span class="plan-add" title="Eintrag anlegen">＋</span></div>
            ${byDay(d).map((it) => `
              <button class="plan-item st-${esc(it.status)}" data-item="${esc(it.id)}" title="${esc(STATUS[it.status])}${it.agentId ? ' · ' + esc(agentName(it.agentId)) : ''}">
                <span class="pi-type">${esc(it.type)}</span><span class="pi-title">${esc(it.title)}</span>
                ${it.pending ? '<span class="pi-badge">⏳</span>' : it.resultId ? '<span class="pi-badge">📎</span>' : ''}
              </button>`).join('')}
          </div>`).join('')}
      </div>
      <div class="plan-legend">${Object.entries(STATUS).map(([k, v]) => `<span class="plan-item st-${k}">${v}</span>`).join('')}<span>⏳ Entwurf läuft · 📎 Ergebnis verknüpft</span></div>
    </div>`);
  $('#modal-card').classList.add('wide');
  const shift = (n) => {
    const a = planView.anchor ? parseYmd(planView.anchor) : new Date();
    planView.anchor = ymd(planView.mode === 'week' ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1));
    openPlanner();
  };
  $('#plan-prev').onclick = () => shift(-1);
  $('#plan-next').onclick = () => shift(1);
  $('#plan-today').onclick = () => { planView.anchor = null; openPlanner(); };
  $('#modal-card').querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { planView.mode = b.dataset.mode; openPlanner(); }));
  $('#plan-new').onclick = () => openPlanItemForm({ date: today });
  $('#plan-bulk').onclick = () => openPlanBulk();
  $('#modal-card').querySelectorAll('.plan-add').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openPlanItemForm({ date: b.closest('[data-day]').dataset.day }); }));
  $('#modal-card').querySelectorAll('[data-item]').forEach((b) => (b.onclick = () => openPlanItemForm(items.find((x) => x.id === b.dataset.item))));
}

// Typ-Auswahl: feste Typen als Dropdown, „Eigener Typ…“ blendet ein Textfeld ein.
function typeField(current) {
  const esc = C.esc;
  const custom = current && !C.S.planTypes.includes(current);
  return `<select name="type" onchange="this.nextElementSibling.hidden = this.value !== '__custom'; if (!this.nextElementSibling.hidden) this.nextElementSibling.focus()">
      ${C.S.planTypes.map((t) => `<option value="${esc(t)}" ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      <option value="__custom" ${custom ? 'selected' : ''}>✏️ Eigener Typ…</option>
    </select><input name="customType" maxlength="30" placeholder="z. B. Podcast, Messe, Rechnung" value="${custom ? esc(current) : ''}" ${custom ? '' : 'hidden'} style="margin-top:6px">`;
}

function typeValue(f) {
  return f.type.value === '__custom' ? (f.customType.value.trim() || 'Sonstiges') : f.type.value;
}

async function openPlanItemForm(it) {
  const esc = C.esc;
  const isNew = !it.id;
  const templates = await C.api('GET', '/api/templates');
  C.openModal(`
    <div class="modal-head"><h2>${isNew ? '＋ Neuer Eintrag' : '📅 Eintrag'}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="pi-form" autocomplete="off">
        <div class="field"><label>Titel / Thema</label><input name="title" maxlength="120" value="${esc(it.title || '')}" placeholder="z. B. Herbst-Kollektion vorstellen"></div>
        <div class="row2">
          <div class="field"><label>Datum</label><input name="date" type="date" value="${esc(it.date || ymd(new Date()))}"></div>
          <div class="field"><label>Typ</label>${typeField(it.type || 'Post')}</div>
        </div>
        <div class="row2">
          <div class="field"><label>Projekt</label><select name="projectId">${projectOptions(isNew ? C.S.game.activeProjectId : it.projectId)}</select></div>
          <div class="field"><label>Kontext-Profil</label><select name="profileId">${profileOptions(it.profileId, { none: 'Standard des Projekts' })}</select></div>
        </div>
        <div class="row2">
          <div class="field"><label>Agent für den Entwurf</label><select name="agentId"><option value="">– später wählen –</option>${agentOptions(it.agentId || '__none')}</select></div>
          <div class="field"><label>Vorlage (optional)</label><select name="templateId"><option value="">– Freitext –</option>${templates.map((t) => `<option value="${esc(t.id)}" ${t.id === it.templateId ? 'selected' : ''}>${esc(t.icon)} ${esc(t.title)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Notizen / Hinweise für den Agent</label><textarea name="notes" rows="3" placeholder="z. B. Bezug zum Wochenend-Markt, Foto vom Stand nutzen">${esc(it.notes || '')}</textarea></div>
        ${isNew ? '' : `<div class="field"><label>Status</label><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === it.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`}
        ${it.pending ? '<div class="help">⏳ Ein Entwurf wird gerade erstellt – er erscheint im 📥 Postfach.</div>' : ''}
      </form>
    </div>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn btn-danger" id="pi-del">🗑</button>'}
      ${it.resultId ? '<button class="btn" id="pi-result">📎 Ergebnis ansehen</button>' : ''}
      <span class="spacer"></span>
      <button class="btn" id="pi-back">← Zurück</button>
      <button class="btn" id="pi-save">💾 Speichern</button>
      <button class="btn btn-gold" id="pi-gen">✨ ${it.resultId ? 'Neuen Entwurf' : 'Entwurf erzeugen'}</button>
    </div>`, { narrow: true });
  // Agent-Select: ohne Vorauswahl starten, wenn keiner gesetzt ist
  if (!it.agentId) $('#pi-form').elements.agentId.value = '';
  const body = () => {
    const f = $('#pi-form').elements;
    return {
      title: f.title.value, date: f.date.value, type: typeValue(f), notes: f.notes.value,
      projectId: f.projectId.value || null, profileId: f.profileId.value || null,
      agentId: f.agentId.value || null, templateId: f.templateId.value || null,
      ...(f.status ? { status: f.status.value } : {}),
    };
  };
  const save = async () => (isNew ? C.api('POST', '/api/plan', body()) : C.api('PATCH', `/api/plan/${it.id}`, body()));
  $('#pi-back').onclick = openPlanner;
  $('#pi-save').onclick = async () => { try { await save(); C.toast('📅 Gespeichert'); openPlanner(); } catch (err) { C.toast(err.message, 'error'); } };
  $('#pi-gen').onclick = async () => {
    try {
      const saved = await save();
      if (!saved.agentId) return C.toast('Bitte einen Agent für den Entwurf wählen.', 'error');
      await C.api('POST', `/api/plan/${saved.id}/generate`, {});
      C.toast('✨ Entwurf beauftragt – erscheint im 📥 Postfach');
      openPlanner();
    } catch (err) { C.toast(err.message, 'error'); }
  };
  $('#pi-del')?.addEventListener('click', async () => {
    if (!confirm('Eintrag löschen?')) return;
    try { await C.api('DELETE', `/api/plan/${it.id}`); openPlanner(); } catch (err) { C.toast(err.message, 'error'); }
  });
  $('#pi-result')?.addEventListener('click', () => openResult(it.resultId, () => openPlanItemForm(it)));
}

export async function openPlanBulk(prefill = '') {
  const esc = C.esc;
  const templates = await C.api('GET', '/api/templates');
  C.openModal(`
    <div class="modal-head"><h2>☰ Mehrere planen</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <form class="form" id="pb-form" autocomplete="off">
        <div class="field"><label>Themen – eine pro Zeile</label><textarea name="lines" rows="8" placeholder="Herbst-Kollektion vorstellen&#10;Blick hinter die Kulissen&#10;Kundenfrage beantworten">${esc(prefill)}</textarea>
          <div class="help">Aufzählungszeichen und Nummern werden automatisch entfernt – du kannst z. B. eine Themenliste aus einem Ergebnis einfügen.</div></div>
        <div class="row2">
          <div class="field"><label>Start</label><input name="startDate" type="date" value="${ymd(new Date())}"></div>
          <div class="field"><label>Alle … Tage</label><input name="everyDays" type="number" min="1" max="30" value="1"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Typ</label>${typeField('Post')}</div>
          <div class="field"><label>Vorlage (optional)</label><select name="templateId"><option value="">– Freitext –</option>${templates.map((t) => `<option value="${esc(t.id)}">${esc(t.icon)} ${esc(t.title)}</option>`).join('')}</select></div>
        </div>
        <div class="row2">
          <div class="field"><label>Projekt</label><select name="projectId">${projectOptions(C.S.game.activeProjectId)}</select></div>
          <div class="field"><label>Agent</label><select name="agentId"><option value="">– später wählen –</option>${agentOptions('__none')}</select></div>
        </div>
        <label class="toggle"><input type="checkbox" name="generate"> ✨ Für alle sofort Entwürfe erzeugen (braucht einen Agent)</label>
      </form>
    </div>
    <div class="modal-foot"><button class="btn" id="pb-back">← Zurück</button><button class="btn btn-gold" id="pb-go">☰ Einplanen</button></div>`, { narrow: true });
  $('#pb-form').elements.agentId.value = '';
  $('#pb-back').onclick = openPlanner;
  $('#pb-go').onclick = async () => {
    const f = $('#pb-form').elements;
    try {
      const r = await C.api('POST', '/api/plan/bulk', {
        lines: f.lines.value, startDate: f.startDate.value, everyDays: Number(f.everyDays.value),
        type: typeValue(f), templateId: f.templateId.value || null, projectId: f.projectId.value || null, agentId: f.agentId.value || null,
      });
      if (f.generate.checked) {
        if (!f.agentId.value) C.toast('Für Entwürfe bitte einen Agent wählen.', 'error');
        else for (const it of r.items) await C.api('POST', `/api/plan/${it.id}/generate`, {});
      }
      C.toast(`☰ ${r.created} Einträge eingeplant${f.generate.checked && f.agentId.value ? ' – Entwürfe laufen' : ''}`);
      planView.anchor = f.startDate.value;
      openPlanner();
    } catch (err) { C.toast(err.message, 'error'); }
  };
}

// Einzelnes Ergebnis anzeigen (aus Planer / Postfach)
async function openResult(id, back) {
  const esc = C.esc;
  try {
    const e = await C.api('GET', `/api/archive/${id}`);
    C.openModal(`
      <div class="modal-head"><h2>📎 ${esc(e.agentAvatar || '')} ${esc(e.agentName)}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
      <div class="modal-body"><div class="bubble result-view">${C.renderMarkdown(e.finalText || e.text)}</div></div>
      <div class="modal-foot">${back ? '<button class="btn" id="res-back">← Zurück</button>' : ''}<button class="btn" id="res-convert">♻️ Umwandeln</button><button class="btn" id="res-copy">📋 kopieren</button></div>`, { narrow: true });
    $('#res-back')?.addEventListener('click', back);
    $('#res-copy').onclick = async () => { await navigator.clipboard.writeText(e.finalText || e.text); C.toast('📋 Kopiert'); };
    $('#res-convert').onclick = () => openConvert({ sourceId: e.id, agentId: e.agentId });
  } catch (err) { C.toast(err.message, 'error'); }
}

// ---------------------------------------------------------------- Postfach
let inboxFilter = { projectId: '', profileId: '' };

async function openInbox() {
  const esc = C.esc;
  const params = new URLSearchParams(inboxFilter);
  const items = await C.api('GET', '/api/inbox?' + params);
  const chipP = (id) => { const p = C.S.projects.find((x) => x.id === id); return p ? `<span class="chip proj" style="--pc:${esc(p.color)}">${esc(p.icon)} ${esc(p.name)}</span>` : ''; };
  const chipF = (id) => { const p = C.S.profiles.find((x) => x.id === id); return p ? `<span class="chip">${esc(p.icon)} ${esc(p.name)}</span>` : ''; };
  const when = (ts) => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const card = (it) => {
    if (it.kind === 'relay') {
      return `<div class="inbox-item relay" data-id="${esc(it.id)}">
        <div class="ib-head"><b>${esc(it.agentAvatar)} ${esc(it.agentName)}</b><span class="chip">⏸️ Weitergabe an ${esc(it.toName)}</span>${chipP(it.projectId)}<span class="spacer"></span><span class="ib-when">${esc(when(it.ts))}</span></div>
        <details class="ib-text"><summary>Ergebnis anzeigen</summary><div class="bubble">${C.renderMarkdown(it.text)}</div></details>
        <div class="ib-actions"><button class="btn btn-sm btn-gold" data-relay="${esc(it.agentId)}" data-approve="1">✅ Freigeben & weitergeben</button><button class="btn btn-sm" data-relay="${esc(it.agentId)}" data-approve="0">✖ Nicht weitergeben</button></div>
      </div>`;
    }
    const body = it.sections.length
      ? `<div class="ib-sections">${it.sections.map((s, i) => `<div class="ib-sec"><div class="ib-sec-head"><b>${esc(s.name)}</b><span class="ib-len">${s.text.length} Z.</span><button class="btn btn-sm" data-copy-sec="${esc(it.id)}|${i}">📋 kopieren</button></div><div class="ib-sec-text">${esc(s.text)}</div></div>`).join('')}</div>`
      : `<div class="bubble ib-md">${C.renderMarkdown(it.finalText || it.text)}</div>`;
    return `<div class="inbox-item ${it.escalated ? 'escalated' : ''}" data-id="${esc(it.id)}">
      <div class="ib-head">
        <b>${esc(it.agentAvatar || '')} ${esc(it.agentName)}</b>
        ${it.escalated ? '<span class="chip score bad">🧐 Prüfer-Ziel nicht erreicht</span>' : ''}
        ${typeof it.score === 'number' ? `<span class="chip score">🧐 ${it.score}/10</span>` : ''}
        ${it.planItem ? `<span class="chip">📅 ${esc(new Date(it.planItem.date + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }))} ${esc(it.planItem.title)}</span>` : ''}
        ${chipP(it.projectId)}${chipF(it.profileId)}${it.finalText ? '<span class="chip">✏️ bearbeitet</span>' : ''}
        <span class="spacer"></span><span class="ib-when">${esc(when(it.ts))}</span>
      </div>
      <div class="ib-prompt">${esc((it.prompt || '').split('\n')[0].slice(0, 200))}</div>
      ${it.warnings.length ? `<div class="ib-warn">⚠️ ${it.warnings.map(esc).join(' · ')}</div>` : ''}
      ${body}
      <div class="ib-edit" hidden><textarea rows="8">${esc(it.finalText || it.text)}</textarea><div class="ib-actions"><button class="btn btn-sm btn-gold" data-act="save">💾 Endfassung speichern</button><button class="btn btn-sm" data-act="cancel">Abbrechen</button></div></div>
      <div class="ib-reply" hidden><input placeholder=""><button class="btn btn-sm btn-gold" data-act="send">Senden</button></div>
      <div class="ib-actions">
        <button class="btn btn-sm btn-gold" data-act="approve">✅ Freigeben</button>
        <button class="btn btn-sm" data-act="edit">✏️ Bearbeiten</button>
        <button class="btn btn-sm" data-act="revise">🔁 Nochmal mit Hinweis</button>
        <button class="btn btn-sm" data-act="reject">✖ Ablehnen</button>
        <button class="btn btn-sm" data-act="done">✔ Erledigt</button>
        <button class="btn btn-sm" data-act="convert">♻️ Umwandeln</button>
        <button class="btn btn-sm" data-act="copy">📋 Alles</button>
        ${it.profileId && C.S.profiles.some((p) => p.id === it.profileId) ? '<label class="toggle ib-learn" title="Freigabe/Ablehnung/Hinweis als Vorliebe ins Profil übernehmen"><input type="checkbox" data-learn> 💡 Als Vorliebe merken</label>' : ''}
      </div>
    </div>`;
  };
  C.openModal(`
    <div class="modal-head"><h2>📥 Postfach · ${items.length}</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <div class="arch-tools">
        <select id="ib-project">${projectOptions(inboxFilter.projectId, { none: 'Alle Projekte' })}<option value="none" ${inboxFilter.projectId === 'none' ? 'selected' : ''}>📄 Ohne Projekt</option></select>
        <select id="ib-profile">${profileOptions(inboxFilter.profileId, { none: 'Alle Profile' })}<option value="none" ${inboxFilter.profileId === 'none' ? 'selected' : ''}>Ohne Profil</option></select>
      </div>
      <div class="inbox-list">${items.map(card).join('') || '<div class="empty-note">🎉 Alles erledigt – nichts wartet auf dich.</div>'}</div>
    </div>`);
  $('#modal-card').classList.add('wide');
  $('#ib-project').onchange = (e) => { inboxFilter.projectId = e.target.value; openInbox(); };
  $('#ib-profile').onchange = (e) => { inboxFilter.profileId = e.target.value; openInbox(); };
  const root = $('#modal-card');
  root.querySelectorAll('[data-relay]').forEach((b) => (b.onclick = async () => {
    try { await C.api('POST', `/api/agents/${b.dataset.relay}/relay-decision`, { approve: b.dataset.approve === '1' }); openInbox(); } catch (err) { C.toast(err.message, 'error'); }
  }));
  root.querySelectorAll('[data-copy-sec]').forEach((b) => (b.onclick = async () => {
    const [id, i] = b.dataset.copySec.split('|');
    await navigator.clipboard.writeText(items.find((x) => x.id === id).sections[Number(i)].text);
    b.textContent = '✓ kopiert';
  }));
  root.querySelectorAll('.inbox-item:not(.relay)').forEach((el) => {
    const it = items.find((x) => x.id === el.dataset.id);
    const learn = () => Boolean(el.querySelector('[data-learn]')?.checked);
    const reply = el.querySelector('.ib-reply');
    const ask = (mode, placeholder) => { reply.hidden = false; reply.dataset.mode = mode; reply.querySelector('input').placeholder = placeholder; reply.querySelector('input').focus(); };
    const post = async (path, body, msg) => {
      try {
        const r = await C.api('POST', `/api/inbox/${it.id}/${path}`, body);
        C.toast(msg + (r?.learned ? ' · 💡 als Vorliebe gemerkt' : ''));
        openInbox();
      } catch (err) { C.toast(err.message, 'error'); }
    };
    el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'approve') return post('approve', { learn: learn() }, '✅ Freigegeben');
      if (act === 'done') return post('done', {}, '✔ Erledigt');
      if (act === 'reject') return ask('reject', 'Grund (optional, hilft beim Lernen) – Enter zum Ablehnen');
      if (act === 'revise') return ask('revise', 'Was soll anders werden? z. B. kürzer, mehr Humor, ohne Emojis');
      if (act === 'convert') return openConvert({ sourceId: it.id, agentId: it.agentId });
      if (act === 'copy') { await navigator.clipboard.writeText(it.finalText || it.text); b.textContent = '✓ kopiert'; return; }
      if (act === 'edit') { el.querySelector('.ib-edit').hidden = false; el.querySelector('.ib-edit textarea').focus(); return; }
      if (act === 'cancel') { el.querySelector('.ib-edit').hidden = true; return; }
      if (act === 'save') {
        try { await C.api('POST', `/api/inbox/${it.id}/edit`, { text: el.querySelector('.ib-edit textarea').value }); C.toast('💾 Endfassung gespeichert'); openInbox(); } catch (err) { C.toast(err.message, 'error'); }
        return;
      }
      if (act === 'send') {
        const v = reply.querySelector('input').value.trim();
        if (reply.dataset.mode === 'reject') return post('reject', { reason: v, learn: learn() }, '✖ Abgelehnt');
        if (!v) return C.toast('Bitte einen Hinweis eingeben.', 'error');
        return post('revise', { hint: v, learn: learn() }, '🔁 Überarbeitung beauftragt');
      }
    }));
    reply.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); reply.querySelector('[data-act="send"]').click(); } });
  });
}

// ---------------------------------------------------------------- Umwandeln
export async function openConvert({ sourceId, agentId }) {
  if (needAgents()) return;
  const esc = C.esc;
  const templates = await C.api('GET', '/api/templates');
  const groups = C.S.templateCategories.map((c) => ({ c, list: templates.filter((t) => t.category === c.id) })).filter((g) => g.list.length);
  C.openModal(`
    <div class="modal-head"><h2>♻️ Umwandeln</h2><button class="btn btn-ghost btn-icon" data-close>✕</button></div>
    <div class="modal-body">
      <p class="muted-intro">Das Ergebnis wird als Ausgangsmaterial mitgegeben. Wähle ein oder mehrere Zielformate – pro Format entsteht ein eigener Auftrag.</p>
      <div class="conv-groups">${groups.map((g) => `
        <div class="conv-group"><div class="mini-label">${esc(g.c.icon)} ${esc(g.c.title)}</div>
          <div class="conv-list">${g.list.map((t) => `<label class="conv-item"><input type="checkbox" value="${esc(t.id)}"><span>${esc(t.icon)} ${esc(t.title)}</span></label>`).join('')}</div>
        </div>`).join('')}
      </div>
      <div class="row2">
        <div class="field"><label>Agent</label><select id="conv-agent">${agentOptions(agentId)}</select></div>
        <div class="field"><label>Zusätzlicher Hinweis (optional)</label><input id="conv-note" placeholder="z. B. lockerer Ton, für Einsteiger"></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Abbrechen</button><button class="btn btn-gold" id="conv-go">♻️ Umwandeln</button></div>`, { narrow: true });
  $('#conv-go').onclick = async () => {
    const ids = [...$('#modal-card').querySelectorAll('.conv-item input:checked')].map((x) => x.value);
    if (!ids.length) return C.toast('Bitte mindestens ein Zielformat wählen.', 'error');
    try {
      const r = await C.api('POST', '/api/convert', { sourceId, agentId, templateIds: ids, targetAgentId: $('#conv-agent').value, note: $('#conv-note').value });
      C.toast(`♻️ ${r.count} ${r.count === 1 ? 'Umwandlung' : 'Umwandlungen'} beauftragt`);
      C.closeModal();
    } catch (err) { C.toast(err.message, 'error'); }
  };
}
