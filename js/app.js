/* Bänkplacering – gränssnitt och lagring */
(() => {
  'use strict';

  const KEY = 'bankplacering-v1';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const LOCK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>';
  const UNLOCK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M9 10h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1V7a5 5 0 0 1 9.6-2l-1.8.9A3 3 0 0 0 9 7v3z"/></svg>';

  // ---------- Lagring ----------
  const blank = () => ({ version: 1, rooms: [], classes: [], results: [], current: null, gr: { cur: null, history: [] } });
  function normalize(d) {
    const out = Object.assign(blank(), d);
    out.gr = Object.assign({ cur: null, history: [] }, d.gr || {});
    return out;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      return normalize(JSON.parse(raw));
    } catch (e) { return blank(); }
  }
  let S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Kunde inte spara i webbläsaren.'); }
  }

  const ui = { tab: 'lottning', roomId: null, classId: null, tool: 'h', flipped: false, sel: null, moving: null, absOpen: false, resFilter: '' };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(KEY + '-ui') || '{}')); } catch (e) { /* ignore */ }
  function saveUi() {
    try {
      localStorage.setItem(KEY + '-ui', JSON.stringify({ tab: ui.tab, roomId: ui.roomId, classId: ui.classId, flipped: ui.flipped, tool: ui.tool }));
    } catch (e) { /* ignore */ }
  }

  const room = id => S.rooms.find(r => r.id === id);
  const klass = id => S.classes.find(c => c.id === id);

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  const fmtDate = iso => { try { return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
  function isoWeek(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y) / 86400000 + 1) / 7);
  }

  // ---------- Klassrumsgeometri ----------
  const deskCells = d => (d.orient === 'v' ? [[d.x, d.y], [d.x, d.y + 1]] : [[d.x, d.y], [d.x + 1, d.y]]);
  function occupancy(r, ignore) {
    const m = new Map();
    r.desks.forEach(d => { if (d.id !== ignore) deskCells(d).forEach(([a, b]) => m.set(a + ',' + b, d)); });
    return m;
  }
  function fits(r, x, y, o, ignore) {
    const cells = o === 'h' ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    if (cells.some(([a, b]) => a < 0 || b < 0 || a >= r.cols || b >= r.rows)) return false;
    const occ = occupancy(r, ignore);
    return cells.every(([a, b]) => !occ.has(a + ',' + b));
  }
  function joins(r) {
    const occ = occupancy(r);
    const res = {};
    r.desks.forEach(d => {
      const j = { a: false, b: false };
      if (d.orient === 'v') {
        const T = occ.get(d.x + ',' + (d.y - 1)), B = occ.get(d.x + ',' + (d.y + 2));
        j.a = !!(T && T.orient === 'v'); j.b = !!(B && B.orient === 'v');
      } else {
        const L = occ.get((d.x - 1) + ',' + d.y), R = occ.get((d.x + 2) + ',' + d.y);
        j.a = !!(L && L.orient !== 'v'); j.b = !!(R && R.orient !== 'v');
      }
      res[d.id] = j;
    });
    return res;
  }
  function applyTemplate(r, perRow, nRows, join) {
    join = clamp(join, 1, perRow);
    const groups = Math.ceil(perRow / join);
    r.cols = perRow * 2 + (groups - 1);
    r.rows = nRows * 2 - 1;
    r.desks = [];
    for (let y = 0; y < nRows; y++) {
      let x = 0;
      for (let k = 0; k < perRow; k++) {
        if (k > 0 && k % join === 0) x++;
        r.desks.push({ id: uid(), x, y: y * 2, orient: 'h' });
        x += 2;
      }
    }
    r.cols = Math.max(r.cols, 2); r.rows = Math.max(r.rows, 2);
  }

  // Ritar klassrummet. edit = redigeringsläge med rutnät.
  function roomGrid(r, opt) {
    const flip = ui.flipped;
    const J = joins(r);
    let h = `<div class="grid ${opt.edit ? 'edit' : ''}" style="--cols:${r.cols};--rows:${r.rows}">`;
    if (opt.edit) {
      for (let y = 0; y < r.rows; y++) for (let x = 0; x < r.cols; x++) {
        const dx = flip ? r.cols - 1 - x : x, dy = flip ? r.rows - 1 - y : y;
        h += `<div class="cell" data-x="${x}" data-y="${y}" style="grid-column:${dx + 1};grid-row:${dy + 1}"></div>`;
      }
    }
    r.desks.forEach(d => {
      const v = d.orient === 'v';
      let x = d.x, y = d.y;
      if (flip) { x = r.cols - 1 - x - (v ? 0 : 1); y = r.rows - 1 - y - (v ? 1 : 0); }
      let { a, b } = J[d.id];
      if (flip) [a, b] = [b, a];
      const cls = ['desk', v ? 'v' : 'h', a ? (v ? 'jt' : 'jl') : '', b ? (v ? 'jb' : 'jr') : '', ui.moving === d.id ? 'moving' : ''].join(' ');
      const seats = [0, 1].map(i => (opt.edit ? '<div class="seat ghost"></div>' : opt.seatHTML(d.id + ':' + i)));
      if (flip) seats.reverse();
      h += `<div class="${cls}" data-desk="${d.id}" style="grid-column:${x + 1}/span ${v ? 1 : 2};grid-row:${y + 1}/span ${v ? 2 : 1}">${seats.join('')}</div>`;
    });
    h += '</div>';
    const board = `<div class="board">Tavla</div>`;
    return `<div class="room-scroll"><div class="room-inner">${flip ? '' : board}${h}${flip ? board : ''}</div></div>`;
  }

  // ---------- Rendering ----------
  function render() {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
    const v = $('#view');
    const grupprum = el => (window.Grupprum ? window.Grupprum.render(el) : renderLottning(el));
    const guider = el => (window.Guide ? window.Guide.render(el) : renderLottning(el));
    ({ lottning: renderLottning, grupprum, guider, klasser: renderKlasser, klassrum: renderKlassrum, sparade: renderSparade, data: renderData }[ui.tab] || renderLottning)(v);
    saveUi();
  }

  // ----- Lottning -----
  function ensureCurrent() {
    if (!S.current) S.current = {};
    const c = S.current;
    if (!klass(c.classId)) { c.classId = S.classes[0]?.id || null; c.assignment = {}; c.locks = []; c.absent = []; }
    if (!room(c.roomId)) { c.roomId = S.rooms[0]?.id || null; c.assignment = {}; c.locks = []; }
    c.opts = Object.assign({ wishes: true, avoid: true, gender: 'none' }, c.opts || {});
    c.assignment = c.assignment || {};
    c.locks = c.locks || [];
    c.absent = c.absent || [];
    // städa bort platser/elever som inte längre finns
    const k = klass(c.classId), r = room(c.roomId);
    if (k && r) {
      const ids = new Set(k.students.map(s => s.id));
      c.absent = c.absent.filter(id => ids.has(id));
      const seatIds = new Set(r.desks.flatMap(d => [d.id + ':0', d.id + ':1']));
      const seen = new Set();
      Object.keys(c.assignment).forEach(sid => {
        const st = c.assignment[sid];
        if (!seatIds.has(sid) || !ids.has(st) || c.absent.includes(st) || seen.has(st)) delete c.assignment[sid];
        else seen.add(st);
      });
      c.locks = c.locks.filter(sid => c.assignment[sid]);
    }
    return c;
  }

  function seatHTML(seatId, ctx) {
    const sid = ctx.c.assignment[seatId];
    const st = sid && ctx.byId.get(sid);
    const sel = ui.sel && ui.sel.seat === seatId;
    if (!st) return `<div class="seat empty ${sel ? 'sel' : ''}" data-seat="${seatId}" title="Tom plats"></div>`;
    const locked = ctx.locks.has(seatId);
    const inf = ctx.an.info[sid] || {};
    const nm = id => ctx.all.get(id)?.name || '?';
    let mark = '';
    if (inf.avoidHit && inf.avoidHit.length) mark = '<span class="mk bad">!</span>';
    else if (inf.hasWish) mark = inf.metIds.length ? '<span class="mk ok">✓</span>' : '<span class="mk no">–</span>';
    const tip = [st.name];
    if ((st.wishes || []).length) tip.push('Önskar: ' + st.wishes.map(nm).join(', '));
    if (inf.partner) tip.push('Bänkkompis: ' + nm(inf.partner));
    if (inf.neigh && inf.neigh.length) tip.push('Granne: ' + inf.neigh.map(nm).join(', '));
    if (inf.avoidHit && inf.avoidHit.length) tip.push('Ska inte sitta med: ' + inf.avoidHit.map(nm).join(', '));
    if (locked) tip.push('Låst plats');
    return `<div class="seat filled g-${st.gender || 'x'} ${sel ? 'sel' : ''} ${locked ? 'locked' : ''}" data-seat="${seatId}" title="${esc(tip.join('\n'))}">` +
      `<span class="nm">${esc(st.name)}</span>${mark}` +
      `<button class="lock" data-lock="${seatId}" aria-label="${locked ? 'Lås upp' : 'Lås plats'}">${locked ? LOCK : UNLOCK}</button></div>`;
  }

  function renderLottning(v) {
    if (!S.classes.length || !S.rooms.length) {
      v.innerHTML = `<section class="card empty">
        <h2>Kom igång</h2>
        <p>Du behöver minst ett <b>klassrum</b> och en <b>klass</b> innan du kan lotta.</p>
        <ol>
          <li>Rita upp hur bänkarna står under <b>Klassrum</b>.</li>
          <li>Skapa en klass och lägg till elever (kön, önskemål) under <b>Klasser</b>.</li>
          <li>Kom tillbaka hit och lotta.</li>
        </ol>
        <div class="row wrap gap">
          <button class="btn primary" data-go="klassrum">Skapa klassrum</button>
          <button class="btn" data-go="klasser">Skapa klass</button>
          <button class="btn ghost" data-action="sample">Ladda exempeldata</button>
        </div></section>`;
      return;
    }
    const c = ensureCurrent();
    const k = klass(c.classId), r = room(c.roomId);
    const present = k.students.filter(s => !c.absent.includes(s.id));
    const all = new Map(k.students.map(s => [s.id, s]));
    const byId = new Map(present.map(s => [s.id, s]));
    const seats = r.desks.length * 2;
    const an = Lottning.analyze(r, present, c.assignment, c.opts);
    const hasAsg = Object.keys(c.assignment).length > 0;
    const locks = new Set(c.locks);
    const saved = c.savedId && S.results.find(x => x.id === c.savedId);
    const ctx = { c, byId, all, an, locks };
    const nm = id => all.get(id)?.name || '?';
    const opt = (val, cur, label) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(label)}</option>`;

    let rep = '';
    if (hasAsg) {
      const sm = an.sum;
      rep = '<section class="card report no-print"><div class="stats">';
      if (c.opts.wishes) {
        rep += sm.withWish
          ? `<div class="stat ${sm.met === sm.withWish ? 'good' : ''}"><b>${sm.met} / ${sm.withWish}</b><span>sitter med någon de önskat</span></div>`
          : '<div class="stat"><b>–</b><span>inga önskemål ifyllda</span></div>';
      }
      if (c.opts.avoid) rep += `<div class="stat ${sm.avoid.length ? 'bad' : 'good'}"><b>${sm.avoid.length}</b><span>${sm.avoid.length === 1 ? 'krock' : 'krockar'} med "ska inte sitta med"</span></div>`;
      if (sm.same + sm.mixed) rep += `<div class="stat"><b>${sm.same} / ${sm.mixed}</b><span>bänkpar samma kön / blandade</span></div>`;
      rep += `<div class="stat"><b>${present.length - sm.unplaced.length} / ${seats}</b><span>platser används</span></div>`;
      rep += '</div>';
      if (c.opts.wishes && sm.unmet.length) rep += `<p class="small"><b>Önskemål ej uppfyllt:</b> ${sm.unmet.map(id => esc(nm(id))).join(', ')}</p>`;
      if (sm.avoid.length) rep += `<p class="small bad-text"><b>Sitter bredvid någon de inte ska:</b> ${sm.avoid.map(([a, b]) => esc(nm(a) + ' & ' + nm(b))).join(', ')}</p>`;
      if (sm.unplaced.length) {
        rep += `<div class="unplaced"><b class="small">Saknar plats:</b> <span class="chips">${sm.unplaced.map(id =>
          `<button class="chip ${ui.sel && ui.sel.student === id ? 'sel' : ''}" data-place="${id}">${esc(nm(id))}</button>`).join('')}</span>
          <span class="muted small">Klicka på ett namn och sedan på en tom plats – eller lotta igen.</span></div>`;
      }
      rep += '</section>';
    }

    v.innerHTML = `
      <h2 class="print-only">${esc(k.name)} · ${esc(r.name)}${saved ? ' · ' + esc(saved.name) : ''}</h2>
      <section class="card controls no-print">
        <div class="row wrap gap">
          <label class="field">Klass <select data-field="classId">${S.classes.map(x => opt(x.id, c.classId, `${x.name} (${x.students.length})`)).join('')}</select></label>
          <label class="field">Klassrum <select data-field="roomId">${S.rooms.map(x => opt(x.id, c.roomId, `${x.name} (${x.desks.length * 2} platser)`)).join('')}</select></label>
          <label class="field">Kön <select data-field="gender">
            ${opt('none', c.opts.gender, 'Ingen hänsyn')}
            ${opt('same', c.opts.gender, 'Killar med killar, tjejer med tjejer')}
            ${opt('mixed', c.opts.gender, 'Blandat – kille och tjej')}
          </select></label>
          <div class="checks">
            <label class="check"><input type="checkbox" data-field="wishes" ${c.opts.wishes ? 'checked' : ''}> Ta hänsyn till önskemål</label>
            <label class="check"><input type="checkbox" data-field="avoid" ${c.opts.avoid ? 'checked' : ''}> Undvik "ska inte sitta med"</label>
          </div>
        </div>
        <details class="absent" ${ui.absOpen ? 'open' : ''}>
          <summary>Frånvarande idag${c.absent.length ? ` (${c.absent.length})` : ''} <span class="muted small">· ${present.length} elever lottas på ${seats} platser</span></summary>
          <p class="muted small">Klicka på de elever som inte är här – de lottas inte in.</p>
          <div class="chips">${k.students.map(s => `<button class="chip ${c.absent.includes(s.id) ? 'off' : ''}" data-absent="${s.id}">${esc(s.name)}</button>`).join('') || '<span class="muted">Klassen har inga elever.</span>'}</div>
        </details>
        <div class="row wrap gap actions">
          <button class="btn primary" data-action="lotta-full">🎲 Lotta ny placering</button>
          <button class="btn" data-action="lotta-desks" ${hasAsg ? '' : 'disabled'} title="Samma bänkkompisar, nya bänkar">🔀 Lotta om platserna – behåll bänkkompisar</button>
          ${c.locks.length ? `<button class="btn ghost" data-action="clear-locks">Lås upp alla (${c.locks.length})</button>` : ''}
          <span class="spacer"></span>
          <button class="btn ghost" data-action="flip">${ui.flipped ? 'Elevvy (tavlan uppe)' : 'Lärarvy (tavlan nere)'}</button>
          <button class="btn ghost" data-action="print" ${hasAsg ? '' : 'disabled'}>Skriv ut</button>
        </div>
      </section>
      ${rep}
      <section class="card room-card">
        ${hasAsg ? '' : '<p class="hint no-print center">Tryck på <b>Lotta ny placering</b> för att lotta.</p>'}
        ${roomGrid(r, { edit: false, seatHTML: id => seatHTML(id, ctx) })}
        <div class="legend no-print">
          <span><i class="sw g-k"></i>Kille</span><span><i class="sw g-t"></i>Tjej</span>
          <span><b class="mk ok">✓</b> sitter med någon hen önskat</span>
          <span><b class="mk no">–</b> önskemål ej uppfyllt</span>
          <span><b class="mk bad">!</b> bredvid någon hen inte ska sitta med</span>
          <span>${LOCK} låst plats</span>
        </div>
        <p class="hint no-print center">Klicka på två platser för att byta. Klicka på hänglåset för att låsa en elev på sin plats inför nästa lottning.</p>
      </section>
      <section class="card save-box no-print">
        <div class="row wrap gap">
          <input id="resname" value="${esc(saved ? saved.name : `${k.name} – vecka ${isoWeek()}`)}" aria-label="Namn på placeringen">
          <button class="btn primary" data-action="save-result" ${hasAsg ? '' : 'disabled'}>Spara som ny placering</button>
          ${saved ? `<button class="btn" data-action="update-result">Uppdatera "${esc(saved.name)}"</button>` : ''}
        </div>
      </section>`;
    const d = $('details.absent', v);
    if (d) d.addEventListener('toggle', () => { ui.absOpen = d.open; });
  }

  function lotta(mode) {
    const c = ensureCurrent();
    const k = klass(c.classId), r = room(c.roomId);
    const present = k.students.filter(s => !c.absent.includes(s.id));
    if (!present.length) return toast('Klassen har inga närvarande elever.');
    if (present.length > r.desks.length * 2) return toast(`För få platser: ${present.length} elever men ${r.desks.length * 2} platser.`);
    if (mode === 'desks' && !Object.keys(c.assignment).length) return toast('Lotta en hel placering först.');
    document.body.classList.add('busy');
    setTimeout(() => {
      try {
        const res = Lottning.run({ room: r, students: present, assignment: c.assignment, locks: c.locks, mode, opts: c.opts });
        c.assignment = res.assignment;
        c.locks = c.locks.filter(s => c.assignment[s]);
        ui.sel = null;
        save();
        render();
        toast(mode === 'desks' ? 'Nya platser – bänkkompisarna är kvar.' : 'Ny placering lottad!');
      } catch (err) {
        toast(err.message);
      } finally {
        document.body.classList.remove('busy');
      }
    }, 30);
  }

  function seatClick(seatId) {
    const c = S.current;
    const a = c.assignment;
    if (ui.sel && ui.sel.student) {
      a[seatId] = ui.sel.student; // ev. tidigare elev blir utan plats
      c.locks = c.locks.filter(s => s !== seatId);
      ui.sel = null; save(); render(); return;
    }
    if (ui.sel && ui.sel.seat) {
      const s1 = ui.sel.seat;
      ui.sel = null;
      if (s1 !== seatId) {
        const x = a[s1], y = a[seatId];
        if (y) a[s1] = y; else delete a[s1];
        if (x) a[seatId] = x; else delete a[seatId];
        const l1 = c.locks.includes(s1), l2 = c.locks.includes(seatId);
        c.locks = c.locks.filter(s => s !== s1 && s !== seatId);
        if (l1 && a[seatId]) c.locks.push(seatId);
        if (l2 && a[s1]) c.locks.push(s1);
        save();
      }
      render(); return;
    }
    ui.sel = { seat: seatId };
    render();
  }

  // ----- Klasser -----
  function renderKlasser(v) {
    if (!klass(ui.classId)) ui.classId = S.classes[0]?.id || null;
    const k = klass(ui.classId);
    const list = `<aside class="side card"><h3>Klasser</h3><div class="items">${S.classes.map(c =>
      `<button class="item ${c.id === ui.classId ? 'active' : ''}" data-pick-class="${c.id}"><span>${esc(c.name)}</span><small>${c.students.length} elever</small></button>`).join('') ||
      '<p class="muted small">Inga klasser ännu.</p>'}</div><button class="btn full" data-action="new-class">+ Ny klass</button></aside>`;
    if (!k) { v.innerHTML = `<div class="split">${list}<section class="card main"><p class="muted">Skapa en klass för att börja.</p></section></div>`; return; }

    const sById = new Map(k.students.map(s => [s.id, s]));
    const nameOf = id => sById.get(id)?.name;
    const boys = k.students.filter(s => s.gender === 'k').length, girls = k.students.filter(s => s.gender === 't').length;
    const withW = k.students.filter(s => (s.wishes || []).length).length;
    const max = k.maxWishes ?? 3;
    const rows = k.students.map(s => {
      const wch = (s.wishes || []).filter(nameOf).map(id => {
        const mutual = (sById.get(id).wishes || []).includes(s.id);
        return `<span class="chip sm ${mutual ? 'mutual' : ''}" ${mutual ? 'title="Önskar varandra"' : ''}>${esc(nameOf(id))}${mutual ? ' ♥' : ''}</span>`;
      }).join('');
      const ach = (s.avoid || []).filter(nameOf).map(id => `<span class="chip sm bad">${esc(nameOf(id))}</span>`).join('');
      return `<tr>
        <td><input class="sname" value="${esc(s.name)}" data-sname="${s.id}" aria-label="Namn"></td>
        <td><div class="seg">${[['', '–'], ['k', 'Kille'], ['t', 'Tjej']].map(([g, l]) =>
          `<button class="${(s.gender || '') === g ? 'on' : ''} ${g ? 'g-' + g : ''}" data-gender="${g}" data-sid="${s.id}">${l}</button>`).join('')}</div></td>
        <td><button class="chipbox" data-edit-wishes="${s.id}">${wch || '<span class="add">+ Önska</span>'}</button></td>
        <td><button class="chipbox" data-edit-avoid="${s.id}">${ach || '<span class="add">+ Lägg till</span>'}</button></td>
        <td><button class="icon danger" data-del-student="${s.id}" title="Ta bort ${esc(s.name)}">×</button></td></tr>`;
    }).join('');

    v.innerHTML = `<div class="split">${list}<section class="card main">
      <div class="row between">
        <input class="title-input" data-class-name value="${esc(k.name)}" aria-label="Klassens namn">
        <div class="row"><button class="btn ghost" data-action="sort-students">Sortera A–Ö</button><button class="btn ghost danger" data-action="del-class">Ta bort klass</button></div>
      </div>
      <div class="row wrap gap">
        <label class="field">Max antal önskemål per elev <input type="number" min="0" max="10" value="${max}" data-max-wishes></label>
        <span class="muted small">${k.students.length} elever · ${boys} killar · ${girls} tjejer · ${withW} har önskemål</span>
      </div>
      <details class="add-box" ${k.students.length ? '' : 'open'}>
        <summary>Lägg till elever</summary>
        <textarea id="bulk" rows="6" placeholder="Ett namn per rad, t.ex.&#10;Alva, t&#10;Elias, k&#10;Maja"></textarea>
        <p class="muted small">Ett namn per rad. Skriv <code>, k</code> för kille eller <code>, t</code> för tjej efter namnet om du vill ange det direkt. Du kan klistra in en lista från t.ex. Excel.</p>
        <button class="btn primary" data-action="bulk-add">Lägg till</button>
      </details>
      ${k.students.length ? `<div class="table-wrap"><table class="list-table students"><thead><tr><th>Namn</th><th>Kön</th><th>Önskar sitta med</th><th>Ska inte sitta med</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">Klicka i rutorna för att välja önskemål. ♥ betyder att två elever önskat varandra.</p>` : ''}
    </section></div>`;
  }

  function openPicker(sid, kind) {
    const k = klass(ui.classId);
    const s = k.students.find(x => x.id === sid);
    if (!s) return;
    const max = kind === 'wishes' ? (k.maxWishes ?? 3) : Infinity;
    const m = $('#modal');
    const draw = () => {
      const sel = (s[kind] || []).filter(id => k.students.some(x => x.id === id));
      const full = sel.length >= max;
      const desc = kind === 'wishes'
        ? (max === 0 ? 'Önskemål är avstängda för klassen (max 0).' : `Välj upp till ${max}. Valda: ${sel.length} av ${max}.`)
        : 'Lottningen undviker att placera dem bredvid varandra – åt båda hållen.';
      m.innerHTML = `<form method="dialog" class="modal">
        <h3>${kind === 'wishes' ? `Vem vill ${esc(s.name)} sitta med?` : `Vem ska ${esc(s.name)} inte sitta med?`}</h3>
        <p class="muted small">${desc}</p>
        <div class="pick">${k.students.filter(x => x.id !== sid).map(x => {
          const on = sel.includes(x.id);
          const dis = !on && full;
          return `<label class="pk ${on ? 'on' : ''} ${dis ? 'dis' : ''}"><input type="checkbox" value="${x.id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${esc(x.name)}</label>`;
        }).join('')}</div>
        <div class="row end"><button class="btn primary">Klar</button></div></form>`;
    };
    draw();
    m.onchange = e => {
      const cb = e.target;
      if (cb.type !== 'checkbox') return;
      let sel = (s[kind] || []).slice();
      if (cb.checked) { if (sel.length < max) sel.push(cb.value); }
      else sel = sel.filter(i => i !== cb.value);
      s[kind] = sel;
      save();
      draw();
    };
    m.onclose = () => render();
    m.showModal();
  }

  function parseBulk(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const parts = l.split(/[,;\t]/).map(p => p.trim());
      const g = (parts[1] || '').toLowerCase();
      let gender = '';
      if (['k', 'kille', 'p', 'pojke', 'm', 'man', 'b', 'boy'].includes(g)) gender = 'k';
      if (['t', 'tjej', 'f', 'flicka', 'kvinna', 'girl'].includes(g)) gender = 't';
      return { id: uid(), name: parts[0], gender, wishes: [], avoid: [] };
    }).filter(s => s.name);
  }

  // ----- Klassrum -----
  function renderKlassrum(v) {
    if (!room(ui.roomId)) ui.roomId = S.rooms[0]?.id || null;
    const r = room(ui.roomId);
    const list = `<aside class="side card"><h3>Klassrum</h3><div class="items">${S.rooms.map(x =>
      `<button class="item ${x.id === ui.roomId ? 'active' : ''}" data-pick-room="${x.id}"><span>${esc(x.name)}</span><small>${x.desks.length * 2} platser</small></button>`).join('') ||
      '<p class="muted small">Inga klassrum ännu.</p>'}</div><button class="btn full" data-action="new-room">+ Nytt klassrum</button></aside>`;
    if (!r) { v.innerHTML = `<div class="split">${list}<section class="card main"><p class="muted">Skapa ett klassrum för att börja.</p></section></div>`; return; }

    const J = joins(r);
    const joined = r.desks.filter(d => J[d.id].a || J[d.id].b).length;
    const tools = [['h', 'Bänk vågrät'], ['v', 'Bänk lodrät'], ['move', 'Flytta'], ['del', 'Ta bort']];
    const hints = {
      h: 'Klicka på en tom ruta för att ställa ut en bänk. Klicka på en befintlig bänk för att vrida den.',
      v: 'Klicka på en tom ruta för att ställa ut en lodrät bänk. Klicka på en befintlig bänk för att vrida den.',
      move: ui.moving ? 'Klicka på rutan där bänken ska stå (klicka på bänken igen för att avbryta).' : 'Klicka på bänken du vill flytta.',
      del: 'Klicka på en bänk för att ta bort den.'
    };
    v.innerHTML = `<div class="split">${list}<section class="card main">
      <div class="row between">
        <input class="title-input" data-room-name value="${esc(r.name)}" aria-label="Klassrummets namn">
        <div class="row"><button class="btn ghost" data-action="dup-room">Duplicera</button><button class="btn ghost danger" data-action="del-room">Ta bort</button></div>
      </div>
      <div class="row wrap gap">
        <label class="field">Kolumner <input type="number" min="2" max="24" value="${r.cols}" data-room-cols></label>
        <label class="field">Rader <input type="number" min="2" max="20" value="${r.rows}" data-room-rows></label>
        <span class="muted small">${r.desks.length} bänkar · ${r.desks.length * 2} platser${joined ? ` · ${joined} bänkar står kant i kant` : ''}</span>
      </div>
      <div class="row wrap gap">
        <div class="seg tools">${tools.map(([t, l]) => `<button class="${ui.tool === t ? 'on' : ''}" data-tool="${t}">${l}</button>`).join('')}</div>
        <button class="btn ghost" data-action="clear-desks" ${r.desks.length ? '' : 'disabled'}>Rensa alla bänkar</button>
        <span class="spacer"></span>
        <button class="btn ghost" data-action="flip">${ui.flipped ? 'Elevvy (tavlan uppe)' : 'Lärarvy (tavlan nere)'}</button>
      </div>
      <p class="hint">${hints[ui.tool] || ''}</p>
      ${roomGrid(r, { edit: true })}
      <div class="add-box gr-config">
        <div class="row between"><b>Grupprum till ${esc(r.name)}</b><button class="btn" data-action="add-gr">+ Lägg till grupprum</button></div>
        ${(r.groupRooms || []).length ? `<div class="gr-rows">${r.groupRooms.map(g => `
          <div class="row wrap gap gr-row">
            <input value="${esc(g.name)}" data-gr-name="${g.id}" aria-label="Grupprummets namn">
            <label class="row small muted">Max grupper <input type="number" min="1" max="10" value="${g.maxGroups || 1}" data-gr-max="${g.id}"></label>
            <button class="icon danger" data-gr-del="${g.id}" title="Ta bort grupprummet">×</button>
          </div>`).join('')}</div>` : '<p class="muted small">Inga grupprum ännu. Lägg till de grupprum som hör till det här klassrummet – de används under fliken Grupprum.</p>'}
        <label class="row small muted">Max grupper som stannar i klassrummet <input type="number" min="1" max="20" value="${r.mainMaxGroups || ''}" placeholder="alla" data-main-max></label>
      </div>
      <details class="add-box">
        <summary>Snabbmall – skapa bänkrader automatiskt</summary>
        <div class="row wrap gap">
          <label class="field">Bänkar per rad <input type="number" id="t-per" min="1" max="10" value="4"></label>
          <label class="field">Antal rader <input type="number" id="t-rows" min="1" max="10" value="4"></label>
          <label class="field">Bänkar som står ihop <select id="t-join">
            <option value="1">1 (fristående)</option><option value="2" selected>2</option><option value="3">3</option><option value="99">Hela raden</option>
          </select></label>
          <button class="btn primary" data-action="template">Skapa</button>
        </div>
        <p class="muted small">Ersätter bänkarna som finns i klassrummet nu. Du kan sedan justera för hand.</p>
      </details>
      <p class="muted small">Bänkar som står kant i kant i samma riktning räknas som grannar. Eleven på kanten har då någon på båda sidor, vilket ger lottningen fler sätt att uppfylla önskemål.</p>
    </section></div>`;
  }

  function editGridClick(x, y, deskId) {
    const r = room(ui.roomId);
    if (!r) return;
    if (ui.tool === 'del') {
      if (deskId) r.desks = r.desks.filter(d => d.id !== deskId);
    } else if (ui.tool === 'move') {
      if (deskId) ui.moving = ui.moving === deskId ? null : deskId;
      else if (ui.moving) {
        const d = r.desks.find(dd => dd.id === ui.moving);
        if (d) {
          const spot = findSpot(r, x, y, d.orient === 'v' ? 'v' : 'h', d.id);
          if (spot) { d.x = spot[0]; d.y = spot[1]; }
          else { toast('Bänken får inte plats där.'); return; }
        }
        ui.moving = null;
      }
    } else {
      if (deskId) {
        const d = r.desks.find(dd => dd.id === deskId);
        const no = d.orient === 'v' ? 'h' : 'v';
        if (fits(r, d.x, d.y, no, d.id)) d.orient = no;
        else toast('Bänken kan inte vridas här – det är fullt.');
      } else {
        const o = ui.tool === 'v' ? 'v' : 'h';
        const spot = findSpot(r, x, y, o);
        if (spot) r.desks.push({ id: uid(), x: spot[0], y: spot[1], orient: o });
        else { toast('Bänken får inte plats där.'); return; }
      }
    }
    save();
    render();
  }

  // Hittar var en bänk ska stå när man klickar på en ruta. I tavelvyn växer
  // bänken åt andra hållet i modellen, så att den ser ut att växa åt höger/nedåt.
  function findSpot(r, x, y, o, ignore) {
    const alt = o === 'h' ? [x - 1, y] : [x, y - 1];
    const tries = ui.flipped ? [alt, [x, y]] : [[x, y], alt];
    return tries.find(([px, py]) => fits(r, px, py, o, ignore)) || null;
  }

  function resizeRoom(r, cols, rows) {
    const out = r.desks.filter(d => deskCells(d).some(([a, b]) => a >= cols || b >= rows));
    if (out.length && !confirm(`${out.length} bänk(ar) hamnar utanför och tas bort. Fortsätta?`)) { render(); return; }
    r.cols = cols; r.rows = rows;
    r.desks = r.desks.filter(d => !out.includes(d));
    save(); render();
  }

  // ----- Sparade -----
  function renderSparade(v) {
    const list = S.results
      .filter(x => !ui.resFilter || x.classId === ui.resFilter)
      .sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
    v.innerHTML = `<section class="card">
      <div class="row between"><h2 class="h">Sparade placeringar</h2>
        <label class="field">Visa <select data-res-filter><option value="">Alla klasser</option>${S.classes.map(c =>
          `<option value="${c.id}" ${ui.resFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      ${list.length ? `<div class="table-wrap"><table class="list-table"><thead><tr><th>Namn</th><th>Klass</th><th>Klassrum</th><th>Sparad</th><th></th></tr></thead><tbody>${list.map(x => `
        <tr><td><b>${esc(x.name)}</b></td>
        <td>${esc(klass(x.classId)?.name || (x.className || '?') + ' (borttagen)')}</td>
        <td>${esc(room(x.roomId)?.name || (x.roomName || '?') + ' (borttaget)')}</td>
        <td class="muted small">${fmtDate(x.updated || x.created)}</td>
        <td><div class="row end"><button class="btn" data-open-result="${x.id}">Öppna</button><button class="btn ghost" data-rename-result="${x.id}">Byt namn</button><button class="icon danger" data-del-result="${x.id}" title="Ta bort">×</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Inga sparade placeringar ännu. Lotta under fliken Lottning och tryck på <b>Spara som ny placering</b>.</p>'}
    </section>`;
  }

  // ----- Data -----
  function renderData(v) {
    v.innerHTML = `
      <section class="card">
        <h2 class="h">Säkerhetskopia</h2>
        <p>Allt sparas automatiskt i den här webbläsaren. Det betyder att det finns kvar när du stänger sidan – men <b>bara på den här datorn, i den här webbläsaren</b>. Ladda ner en säkerhetskopia ibland, och använd den för att flytta dina klasser och klassrum till en annan dator.</p>
        <div class="row wrap gap">
          <button class="btn primary" data-action="export">Ladda ner säkerhetskopia</button>
          <label class="btn">Återställ från fil (ersätter allt)<input type="file" accept=".json,application/json" data-import="replace" hidden></label>
          <label class="btn">Importera och lägg till<input type="file" accept=".json,application/json" data-import="merge" hidden></label>
        </div>
        <p class="muted small">Just nu: ${S.rooms.length} klassrum · ${S.classes.length} klasser · ${S.classes.reduce((n, c) => n + c.students.length, 0)} elever · ${S.results.length} sparade placeringar · ${S.gr.history.length} grupprumstillfällen.</p>
      </section>
      <section class="card">
        <h2 class="h">Så fungerar lottningen</h2>
        <ul class="small">
          <li><b>Lotta ny placering</b> slumpar fram många placeringar och förbättrar dem steg för steg. Den försöker i första hand se till att <b>så många som möjligt</b> sitter bredvid minst en person de önskat – helst som bänkkompis, annars som granne vid en bänk som står kant i kant.</li>
          <li>Krockar med <b>"ska inte sitta med"</b> undviks mycket starkt.</li>
          <li>Regeln för <b>kön</b> följs om det går, men önskemål väger tyngre.</li>
          <li>Blir det tomma platser hamnar de helst i samma bänk, så att ingen sitter ensam i onödan.</li>
          <li><b>Lotta om platserna</b> behåller bänkkompisarna men flyttar paren till nya bänkar.</li>
          <li><b>Låsta</b> elever sitter kvar på sin plats vid nästa lottning.</li>
          <li>Varje lottning blir olika – lotta igen om du vill se ett annat förslag.</li>
        </ul>
      </section>
      <section class="card">
        <h2 class="h">Testa appen</h2>
        <p>Lägger till ett exempelklassrum och en exempelklass med kön och önskemål.</p>
        <button class="btn" data-action="sample">Ladda exempeldata</button>
      </section>
      <section class="card">
        <h2 class="h">Radera allt</h2>
        <p class="muted small">Tar bort alla klassrum, klasser och sparade placeringar från den här webbläsaren.</p>
        <button class="btn danger" data-action="wipe">Radera all data</button>
      </section>`;
  }

  function loadSample() {
    const r = {
      id: uid(), name: 'Exempelsal', cols: 0, rows: 0, desks: [],
      groupRooms: [{ id: uid(), name: 'Grupprum 1', maxGroups: 1 }, { id: uid(), name: 'Grupprum 2', maxGroups: 1 }, { id: uid(), name: 'Biblioteket', maxGroups: 2 }]
    };
    applyTemplate(r, 4, 4, 2);
    const names = [['Alva', 't'], ['Elias', 'k'], ['Maja', 't'], ['Hugo', 'k'], ['Ella', 't'], ['Liam', 'k'], ['Wilma', 't'], ['Noah', 'k'],
      ['Alice', 't'], ['William', 'k'], ['Saga', 't'], ['Oscar', 'k'], ['Ebba', 't'], ['Lucas', 'k'], ['Astrid', 't'], ['Adam', 'k'],
      ['Freja', 't'], ['Ludvig', 'k'], ['Selma', 't'], ['Charlie', 'k'], ['Agnes', 't'], ['Vincent', 'k'], ['Olivia', 't'], ['Theo', 'k'],
      ['Leah', 't'], ['Melvin', 'k']];
    const st = names.map(([n, g]) => ({ id: uid(), name: n, gender: g, wishes: [], avoid: [] }));
    st.forEach(s => {
      const same = st.filter(x => x !== s && x.gender === s.gender);
      const other = st.filter(x => x !== s && x.gender !== s.gender);
      const cnt = 1 + Math.floor(Math.random() * 3);
      while (s.wishes.length < cnt) {
        const poolArr = Math.random() < 0.8 ? same : other;
        const pick = poolArr[Math.floor(Math.random() * poolArr.length)];
        if (!s.wishes.includes(pick.id)) s.wishes.push(pick.id);
      }
    });
    st[1].avoid.push(st[3].id);
    st[0].avoid.push(st[6].id);
    const k = { id: uid(), name: 'Exempelklass 7B', maxWishes: 3, students: st };
    S.rooms.push(r);
    S.classes.push(k);
    S.current = { classId: k.id, roomId: r.id, assignment: {}, locks: [], absent: [], opts: { wishes: true, avoid: true, gender: 'same' } };
    ui.roomId = r.id; ui.classId = k.id; ui.tab = 'lottning';
    save(); render();
    toast('Exempeldata inlagd – tryck på Lotta!');
  }

  // ---------- Händelser ----------
  const actions = {
    'lotta-full': () => lotta('full'),
    'lotta-desks': () => lotta('desks'),
    'clear-locks': () => { S.current.locks = []; save(); render(); },
    'flip': () => { ui.flipped = !ui.flipped; render(); },
    'print': () => window.print(),
    'save-result': () => {
      const c = ensureCurrent(), k = klass(c.classId), r = room(c.roomId);
      if (!Object.keys(c.assignment).length) return toast('Det finns ingen placering att spara.');
      const name = ($('#resname').value || '').trim() || `${k.name} – vecka ${isoWeek()}`;
      const res = {
        id: uid(), name, classId: c.classId, roomId: c.roomId, created: new Date().toISOString(),
        assignment: { ...c.assignment }, locks: [...c.locks], absent: [...c.absent], opts: { ...c.opts },
        names: Object.fromEntries(k.students.map(s => [s.id, s.name])), className: k.name, roomName: r.name
      };
      S.results.push(res);
      c.savedId = res.id;
      save(); render(); toast('Placeringen är sparad.');
    },
    'update-result': () => {
      const c = ensureCurrent(), k = klass(c.classId), r = room(c.roomId);
      const res = S.results.find(x => x.id === c.savedId);
      if (!res) return;
      Object.assign(res, {
        name: ($('#resname').value || '').trim() || res.name, classId: c.classId, roomId: c.roomId, updated: new Date().toISOString(),
        assignment: { ...c.assignment }, locks: [...c.locks], absent: [...c.absent], opts: { ...c.opts },
        names: Object.fromEntries(k.students.map(s => [s.id, s.name])), className: k.name, roomName: r.name
      });
      save(); render(); toast('Den sparade placeringen är uppdaterad.');
    },
    'sample': loadSample,
    'new-class': () => {
      const name = prompt('Vad heter klassen?', '');
      if (name === null) return;
      const k = { id: uid(), name: name.trim() || 'Ny klass', maxWishes: 3, students: [] };
      S.classes.push(k); ui.classId = k.id; save(); render();
      setTimeout(() => $('#bulk')?.focus(), 0);
    },
    'del-class': () => {
      const k = klass(ui.classId);
      if (!k || !confirm(`Ta bort klassen "${k.name}" med alla elever och önskemål?`)) return;
      S.classes = S.classes.filter(c => c !== k); ui.classId = null; save(); render();
    },
    'sort-students': () => {
      const k = klass(ui.classId);
      k.students.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
      save(); render();
    },
    'bulk-add': () => {
      const k = klass(ui.classId);
      const add = parseBulk($('#bulk').value);
      if (!add.length) return toast('Skriv minst ett namn.');
      k.students.push(...add); save(); render(); toast(`${add.length} elev${add.length === 1 ? '' : 'er'} tillagd${add.length === 1 ? '' : 'a'}.`);
    },
    'new-room': () => {
      const name = prompt('Vad heter klassrummet?', '');
      if (name === null) return;
      const r = { id: uid(), name: name.trim() || 'Nytt klassrum', cols: 12, rows: 8, desks: [] };
      S.rooms.push(r); ui.roomId = r.id; save(); render();
    },
    'dup-room': () => {
      const r = room(ui.roomId);
      const copy = {
        id: uid(), name: r.name + ' (kopia)', cols: r.cols, rows: r.rows, desks: r.desks.map(d => ({ ...d, id: uid() })),
        groupRooms: (r.groupRooms || []).map(g => ({ ...g, id: uid() })), mainMaxGroups: r.mainMaxGroups
      };
      S.rooms.push(copy); ui.roomId = copy.id; save(); render();
    },
    'del-room': () => {
      const r = room(ui.roomId);
      if (!r || !confirm(`Ta bort klassrummet "${r.name}"?`)) return;
      S.rooms = S.rooms.filter(x => x !== r); ui.roomId = null; save(); render();
    },
    'add-gr': () => {
      const r = room(ui.roomId);
      r.groupRooms = r.groupRooms || [];
      r.groupRooms.push({ id: uid(), name: 'Grupprum ' + (r.groupRooms.length + 1), maxGroups: 1 });
      save(); render();
    },
    'clear-desks': () => {
      const r = room(ui.roomId);
      if (!confirm('Ta bort alla bänkar i klassrummet?')) return;
      r.desks = []; save(); render();
    },
    'template': () => {
      const r = room(ui.roomId);
      const per = clamp(parseInt($('#t-per').value, 10) || 4, 1, 10);
      const rows = clamp(parseInt($('#t-rows').value, 10) || 4, 1, 10);
      const join = parseInt($('#t-join').value, 10) || 1;
      if (r.desks.length && !confirm('Ersätta bänkarna som finns nu?')) return;
      applyTemplate(r, per, rows, join); save(); render();
    },
    'export': () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bankplacering-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    'wipe': () => {
      if (!confirm('Radera ALLA klassrum, klasser och sparade placeringar? Det går inte att ångra.')) return;
      S = blank(); save(); render(); toast('All data är raderad.');
    }
  };

  function onClick(e) {
    const t = e.target;
    const go = t.closest('[data-go]');
    if (go) { ui.tab = go.dataset.go; render(); return; }
    if (ui.tab === 'grupprum' && window.Grupprum && window.Grupprum.onClick(e)) return;
    if (ui.tab === 'guider' && window.Guide && window.Guide.onClick(e)) return;
    const act = t.closest('[data-action]');
    if (act) { if (!act.disabled) actions[act.dataset.action]?.(act); return; }

    // Lottning
    const lk = t.closest('[data-lock]');
    if (lk) {
      const c = S.current, id = lk.dataset.lock;
      if (!c.assignment[id]) return;
      c.locks = c.locks.includes(id) ? c.locks.filter(s => s !== id) : [...c.locks, id];
      save(); render(); return;
    }
    const seat = t.closest('[data-seat]');
    if (seat) { seatClick(seat.dataset.seat); return; }
    const ab = t.closest('[data-absent]');
    if (ab) {
      const c = S.current, id = ab.dataset.absent;
      if (c.absent.includes(id)) c.absent = c.absent.filter(x => x !== id);
      else {
        c.absent.push(id);
        Object.keys(c.assignment).forEach(s => { if (c.assignment[s] === id) { delete c.assignment[s]; c.locks = c.locks.filter(l => l !== s); } });
      }
      save(); render(); return;
    }
    const pl = t.closest('[data-place]');
    if (pl) { ui.sel = ui.sel && ui.sel.student === pl.dataset.place ? null : { student: pl.dataset.place }; render(); return; }

    // Klasser
    const pc = t.closest('[data-pick-class]');
    if (pc) { ui.classId = pc.dataset.pickClass; render(); return; }
    const gb = t.closest('[data-gender]');
    if (gb) {
      const s = klass(ui.classId).students.find(x => x.id === gb.dataset.sid);
      s.gender = gb.dataset.gender; save(); render(); return;
    }
    const ew = t.closest('[data-edit-wishes]');
    if (ew) { openPicker(ew.dataset.editWishes, 'wishes'); return; }
    const ea = t.closest('[data-edit-avoid]');
    if (ea) { openPicker(ea.dataset.editAvoid, 'avoid'); return; }
    const ds = t.closest('[data-del-student]');
    if (ds) {
      const k = klass(ui.classId), id = ds.dataset.delStudent;
      const s = k.students.find(x => x.id === id);
      if (!confirm(`Ta bort ${s.name}?`)) return;
      k.students = k.students.filter(x => x.id !== id);
      k.students.forEach(x => { x.wishes = (x.wishes || []).filter(w => w !== id); x.avoid = (x.avoid || []).filter(w => w !== id); });
      save(); render(); return;
    }

    // Klassrum
    const pr = t.closest('[data-pick-room]');
    if (pr) { ui.roomId = pr.dataset.pickRoom; ui.moving = null; render(); return; }
    const grDel = t.closest('[data-gr-del]');
    if (grDel) {
      const r = room(ui.roomId), g = r.groupRooms.find(x => x.id === grDel.dataset.grDel);
      if (!confirm(`Ta bort ${g.name}? Historiken i cirkulationsschemat finns kvar.`)) return;
      r.groupRooms = r.groupRooms.filter(x => x !== g); save(); render(); return;
    }
    const tool = t.closest('[data-tool]');
    if (tool) { ui.tool = tool.dataset.tool; ui.moving = null; render(); return; }
    const desk = t.closest('.grid.edit .desk');
    if (desk) { editGridClick(null, null, desk.dataset.desk); return; }
    const cell = t.closest('.grid.edit .cell');
    if (cell) { editGridClick(+cell.dataset.x, +cell.dataset.y, null); return; }

    // Sparade
    const or = t.closest('[data-open-result]');
    if (or) {
      const res = S.results.find(x => x.id === or.dataset.openResult);
      if (!klass(res.classId) || !room(res.roomId)) return toast('Klassen eller klassrummet finns inte längre.');
      S.current = { classId: res.classId, roomId: res.roomId, assignment: { ...res.assignment }, locks: [...(res.locks || [])], absent: [...(res.absent || [])], opts: { ...res.opts }, savedId: res.id };
      ui.tab = 'lottning'; ui.sel = null; save(); render(); return;
    }
    const rr = t.closest('[data-rename-result]');
    if (rr) {
      const res = S.results.find(x => x.id === rr.dataset.renameResult);
      const name = prompt('Nytt namn:', res.name);
      if (name && name.trim()) { res.name = name.trim(); save(); render(); }
      return;
    }
    const dr = t.closest('[data-del-result]');
    if (dr) {
      const res = S.results.find(x => x.id === dr.dataset.delResult);
      if (!confirm(`Ta bort "${res.name}"?`)) return;
      S.results = S.results.filter(x => x !== res);
      if (S.current && S.current.savedId === res.id) S.current.savedId = null;
      save(); render();
    }
  }

  function onChange(e) {
    const t = e.target;
    if (ui.tab === 'grupprum' && window.Grupprum && window.Grupprum.onChange(e)) return;
    if (t.matches('[data-field]')) {
      const c = ensureCurrent(), f = t.dataset.field;
      if (f === 'classId') { c.classId = t.value; c.assignment = {}; c.locks = []; c.absent = []; c.savedId = null; }
      else if (f === 'roomId') { c.roomId = t.value; c.assignment = {}; c.locks = []; c.savedId = null; }
      else if (f === 'gender') c.opts.gender = t.value;
      else c.opts[f] = t.checked;
      ui.sel = null; save(); render(); return;
    }
    if (t.matches('[data-sname]')) {
      const s = klass(ui.classId).students.find(x => x.id === t.dataset.sname);
      if (t.value.trim()) s.name = t.value.trim();
      save(); render(); return;
    }
    if (t.matches('[data-class-name]')) { const k = klass(ui.classId); k.name = t.value.trim() || k.name; save(); render(); return; }
    if (t.matches('[data-max-wishes]')) { klass(ui.classId).maxWishes = clamp(parseInt(t.value, 10) || 0, 0, 10); save(); render(); return; }
    if (t.matches('[data-room-name]')) { const r = room(ui.roomId); r.name = t.value.trim() || r.name; save(); render(); return; }
    if (t.matches('[data-room-cols]')) { const r = room(ui.roomId); resizeRoom(r, clamp(parseInt(t.value, 10) || r.cols, 2, 24), r.rows); return; }
    if (t.matches('[data-room-rows]')) { const r = room(ui.roomId); resizeRoom(r, r.cols, clamp(parseInt(t.value, 10) || r.rows, 2, 20)); return; }
    if (t.matches('[data-gr-name]')) {
      const g = room(ui.roomId).groupRooms.find(x => x.id === t.dataset.grName);
      g.name = t.value.trim() || g.name; save(); render(); return;
    }
    if (t.matches('[data-gr-max]')) {
      const g = room(ui.roomId).groupRooms.find(x => x.id === t.dataset.grMax);
      g.maxGroups = clamp(parseInt(t.value, 10) || 1, 1, 10); save(); render(); return;
    }
    if (t.matches('[data-main-max]')) {
      const r = room(ui.roomId), n = parseInt(t.value, 10);
      r.mainMaxGroups = n > 0 ? clamp(n, 1, 20) : null; save(); render(); return;
    }
    if (t.matches('[data-res-filter]')) { ui.resFilter = t.value; render(); return; }
    if (t.matches('[data-import]')) {
      const file = t.files[0];
      const mode = t.dataset.import;
      if (!file) return;
      file.text().then(txt => {
        const d = JSON.parse(txt);
        if (!Array.isArray(d.rooms) || !Array.isArray(d.classes)) throw new Error('bad');
        if (mode === 'replace') {
          if (!confirm('Ersätta all data i appen med innehållet i filen?')) return;
          S = normalize(d);
        } else {
          ['rooms', 'classes', 'results'].forEach(key => {
            const have = new Set(S[key].map(x => x.id));
            (d[key] || []).forEach(x => { if (!have.has(x.id)) S[key].push(x); });
          });
          const haveH = new Set(S.gr.history.map(x => x.id));
          ((d.gr && d.gr.history) || []).forEach(x => { if (!haveH.has(x.id)) S.gr.history.push(x); });
        }
        save(); render(); toast('Importen är klar.');
      }).catch(() => toast('Filen kunde inte läsas – är det en säkerhetskopia från appen?'));
      t.value = '';
    }
  }

  // Delas med grupprum.js
  window.BP = {
    get S() { return S; }, ui, save, render, toast, esc, uid, clamp, room, klass, roomGrid, fmtDate, ensureCurrent
  };

  document.addEventListener('DOMContentLoaded', () => {
    const view = $('#view');
    view.addEventListener('click', onClick);
    view.addEventListener('change', onChange);
    $('.tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) { ui.tab = b.dataset.tab; ui.sel = null; ui.moving = null; render(); window.scrollTo(0, 0); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && (ui.sel || ui.moving)) { ui.sel = null; ui.moving = null; render(); }
    });
    render();
  });
})();
