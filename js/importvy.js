/* Bänkplacering – importfönstret och listan "Att reda ut"
 * Förhandsgranskning av import (text, Excel, Google Formulär), kolumnval,
 * klasser ur en klasskolumn, namn som behöver redas ut och sparade smeknamn.
 */
window.ImportUI = (() => {
  'use strict';
  const B = () => window.BP;
  const I = () => window.Import;
  const $ = (s, r = document) => r.querySelector(s);
  let sess = null;

  // Namn som skrivits med små bokstäver får stor bokstav: "maja berg" → "Maja Berg"
  const niceName = n => (n === n.toLowerCase() ? n.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : n);

  function open(src) {
    const { klass, ui } = B();
    const k = klass(ui.classId);
    sess = { source: src.source || 'text', resolutions: {}, addNames: {}, review: {}, edits: {}, pinned: {}, done: {}, renames: {}, maxW: {}, remember: ui.rememberAlias !== false, idCache: {}, mode: 'this', pickGroup: null, ranked: false };
    if (src.rows) {
      sess.kind = 'table';
      sess.rows = src.rows.filter(r => (r || []).some(c => String(c ?? '').trim()));
      const g = I().guessMapping(sess.rows);
      Object.assign(sess, g);
      // Har läraren ställt in kolumnerna förut för samma sorts tabell? Använd det igen.
      const saved = (ui.importMaps || {})[mapKey()];
      if (saved && saved.length === sess.mapping.length) { sess.mapping = saved.slice(); sess.guessed = 'saved'; }
      sess.colsOpen = !sess.hasHeader || sess.guessed === 'saved';
      // Flera önskemålskolumner med siffror ("Önskemål 1", "Önskemål 2") = prioritetsordning
      const wishHeads = g.headers.filter((h, i) => g.mapping[i] === 'wishes');
      sess.ranked = wishHeads.length > 1 && wishHeads.every(h => /\d|första|andra|tredje/i.test(h));
    } else {
      sess.kind = 'lines';
      sess.lines = I().parseText(src.text).entries || [];
    }
    sess.classId = k.id;
    compute();
    if (sess.hasClassCol) {
      const cur = sess.groups.find(g => g.key && g.key === I().classKey(k.name));
      sess.pickGroup = cur ? cur.key : (sess.groups.slice().sort((a, b) => b.entries.length - a.entries.length)[0] || {}).key;
      sess.mode = sess.groups.filter(g => g.key).length > 1 && !cur ? 'all' : 'this';
      compute();
    }
    attach();
    draw();
    $('#modal').showModal();
  }

  function attach() {
    const m = $('#modal');
    m.onchange = onModalChange; m.onclick = onModalClick; m.oninput = null;
    m.onclose = () => { m.classList.remove('wide'); sess = null; };
    m.classList.add('wide');
  }

  // ---------- Ändra en elev direkt i förhandsgranskningen ----------
  function findItem(rk) {
    for (const t of sess.targets) { const it = t.plan.items.find(x => x.reviewKey === rk); if (it) return { t, it }; }
    return null;
  }
  const WISH_FIELDS = ['alone', 'wishGirl', 'wishBoy', 'wishStrict', 'wishRanked'];
  // En tillfällig elev med det appen just nu tolkat – den är det väljaren ändrar i.
  function draftStudent(t, it) {
    const e = it.entry, base = it.existing || {};
    const v = { id: it.student.id, name: e.name };
    v.wishes = (it.wishIds !== undefined ? it.wishIds : base.wishes || []).slice();
    v.avoid = (it.avoidIds !== undefined ? it.avoidIds : base.avoid || []).slice();
    const pos = e.pos !== undefined ? e.pos : base.pos;
    if (pos && (pos.cells || []).length) v.pos = { cells: pos.cells.slice(), strict: !!pos.strict };
    WISH_FIELDS.forEach(f => { const x = e[f] !== undefined ? e[f] : base[f]; if (x) v[f] = f === 'alone' ? {} : true; });
    return v;
  }
  function openEdit(rk, kind) {
    const f = findItem(rk);
    if (!f) return;
    const { t, it } = f;
    const m = $('#modal');
    const form = m.querySelector('.import-preview');
    sess.scroll = [m.scrollTop, form ? form.scrollTop : 0];
    const v = draftStudent(t, it);
    const ctx = {
      klass: { students: allStudents(t), maxWishes: t.maxWishes },
      student: v,
      answer: it.entry.answer,
      save: () => {
        const ed = sess.edits[rk] || (sess.edits[rk] = {});
        if (kind === 'wishes') { ed.wish = { wishes: v.wishes.slice() }; WISH_FIELDS.forEach(x => { ed.wish[x] = !!v[x]; }); }
        else if (kind === 'avoid') ed.avoid = v.avoid.slice();
        else ed.pos = v.pos && v.pos.cells.length ? { cells: v.pos.cells.slice(), strict: !!v.pos.strict } : null;
      },
      onClose: () => {
        attach(); compute(); draw();
        if (!m.open) m.showModal();
        const fm = m.querySelector('.import-preview');
        m.scrollTop = sess.scroll[0]; if (fm) fm.scrollTop = sess.scroll[1];
      }
    };
    m.classList.remove('wide');
    if (kind === 'pos') B().openPosPicker(v.id, ctx); else B().openPicker(v.id, kind, ctx);
  }
  // Lärarens ändringar läggs ovanpå det appen tolkat.
  function applyEdits(t) {
    t.plan.items.forEach(it => {
      const ed = sess.edits[it.reviewKey];
      it.edited = {};
      if (!ed) return;
      const e = it.entry;
      if (ed.wish) {
        it.wishIds = ed.wish.wishes.slice();
        e.alone = ed.wish.alone ? {} : null;
        ['wishGirl', 'wishBoy', 'wishStrict', 'wishRanked'].forEach(x => { e[x] = !!ed.wish[x]; });
        it.edited.wish = true;
      }
      if (ed.avoid) { it.avoidIds = ed.avoid.slice(); it.edited.avoid = true; }
      if ('pos' in ed) { e.pos = ed.pos; it.edited.pos = true; }
      if ('gender' in ed) { e.gender = ed.gender; it.edited.gender = true; }
    });
    // Har läraren själv valt önskemålen tas namnen som inte gick att koppla bort.
    t.plan.unresolved = t.plan.unresolved.filter(u => !((u.kind === 'wish' && u.whoItem.edited.wish) || (u.kind === 'avoid' && u.whoItem.edited.avoid)));
  }

  function mapKey() {
    return sess.hasHeader ? 'h:' + sess.headers.map(h => I().nameKey(h)).join('|') : 'n:' + sess.mapping.length;
  }
  function rememberMapping() {
    const { ui, saveUi } = B();
    ui.importMaps = ui.importMaps || {};
    ui.importMaps[mapKey()] = sess.mapping.slice();
    saveUi();
  }

  function compute() {
    const { S, klass, uid } = B();
    const k = klass(sess.classId);
    let entries = sess.kind === 'table'
      ? I().entriesFromTable(sess.rows, sess.mapping, sess.hasHeader, { ranked: sess.ranked, multiRanked: sess.ranked })
      : sess.lines;
    // Läraren kan rätta namnet på en rad (t.ex. när eleven skrivit sitt smeknamn).
    entries.forEach(e => {
      if (!e.origName) e.origName = niceName(e.name);
      e.name = sess.renames[I().nameKey(e.origName)] || e.origName;
    });
    sess.entries = entries;
    sess.groups = I().groupByClass(entries);
    sess.hasClassCol = entries.some(e => e.klass);
    const targets = [];
    if (!sess.hasClassCol) targets.push({ tid: k.id, klass: k, entries, isNew: false });
    else if (sess.mode === 'this') {
      const g = sess.groups.find(x => x.key === sess.pickGroup) || sess.groups[0];
      const noClass = sess.groups.find(x => x.key === '');
      targets.push({ tid: k.id, klass: k, entries: (g ? g.entries : []).concat(noClass && noClass !== g ? noClass.entries : []), isNew: false });
      sess.skipped = entries.length - targets[0].entries.length;
    } else {
      sess.groups.forEach(g => {
        let target = g.key ? S.classes.find(c => I().classKey(c.name) === g.key) : k;
        let isNew = false;
        if (!target) {
          const id = sess.idCache['class|' + g.key] || (sess.idCache['class|' + g.key] = uid());
          target = { id, name: g.label || g.key, maxWishes: 3, students: [], aliases: {} };
          isNew = true;
        }
        const existingT = targets.find(t => t.klass === target);
        if (existingT) existingT.entries.push(...g.entries);
        else targets.push({ tid: target.id, klass: target, entries: g.entries.slice(), isNew, label: g.label });
      });
      sess.skipped = 0;
    }
    targets.forEach(t => {
      const res = sess.resolutions[t.tid] || (sess.resolutions[t.tid] = {});
      // "Lägg till som ny elev": namn som nämns i önskemål men som inte svarat själva
      Object.entries(res).forEach(([key, val]) => {
        if (val !== 'add') return;
        const tok = sess.addNames[t.tid + '§' + key];
        if (tok && !t.entries.some(e => I().nameKey(e.name) === I().nameKey(tok)) && !t.klass.students.some(s => I().nameKey(s.name) === I().nameKey(tok))) {
          t.entries = t.entries.concat([{ name: niceName(tok), line: '–', raw: '', problems: [] }]);
        }
      });
      const idOf = key => sess.idCache[t.tid + '|' + key] || (sess.idCache[t.tid + '|' + key] = uid());
      // Rättade namn: det eleven skrev räknas som smeknamn, så att andras önskemål med samma namn hittar rätt.
      const aliases = Object.assign({}, t.klass.aliases || {});
      const known = I().matcher(t.klass.students, t.klass.aliases || {});
      t.entries.forEach(e => {
        if (!e.origName || e.origName === e.name) return;
        const hit = known.one(e.name);
        aliases[I().nameKey(e.origName)] = hit && hit.ids.length === 1 ? hit.ids[0] : idOf(I().nameKey(e.name));
      });
      t.maxWishes = sess.maxW[t.tid] ?? t.klass.maxWishes ?? 3;
      const planK = Object.assign({}, t.klass, { aliases, maxWishes: t.maxWishes });
      t.plan = I().plan(planK, t.entries, idOf, res);
      t.plan.items.forEach(it => {
        const rk = t.tid + '§' + I().nameKey(it.entry.origName || it.entry.name);
        it.reviewKey = rk;
        it.review = rk in sess.review ? sess.review[rk] : !!it.entry.uncertain;
      });
      // Elever som haft något att reda ut stannar kvar i rutan tills läraren trycker Klar.
      t.plan.unresolved.forEach(u => {
        const rk = u.whoItem.reviewKey;
        const pin = sess.pinned[rk] || (sess.pinned[rk] = {});
        if (!pin[u.key]) pin[u.key] = { tid: t.tid, key: u.key, kind: u.kind, token: u.token, candidates: u.candidates };
      });
      applyEdits(t);
    });
    sess.targets = targets;
  }

  function nameIn(t, id) {
    const it = t.plan.items.find(x => x.student.id === id);
    if (it) return it.student.name;
    return (t.klass.students.find(s => s.id === id) || {}).name || '?';
  }
  function allStudents(t) {
    const list = t.klass.students.slice();
    t.plan.items.forEach(it => { if (it.isNew) list.push(it.student); });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }

  function draw() {
    const { esc, miniGrid, generalChips } = B();
    const m = $('#modal');
    const T = sess.targets;
    const nItems = T.reduce((a, t) => a + t.plan.items.length, 0);
    const nNew = T.reduce((a, t) => a + t.plan.items.filter(i => i.isNew).length, 0);
    const nUnres = T.reduce((a, t) => a + t.plan.unresolved.length, 0);
    const probs = [];
    T.forEach(t => { t.plan.problems.forEach(p => probs.push(p)); t.plan.items.forEach(it => { if (it.entry.problems.length) probs.push(`<b>${esc(it.entry.name)}</b> (rad ${it.entry.line}): ${it.entry.problems.map(esc).join('; ')}`); }); });

    // --- Kolumner ---
    let cols = '';
    if (sess.kind === 'table') {
      const sample = sess.rows[sess.hasHeader ? 1 : 0] || [];
      const kinds = Object.entries(I().KIND_LABELS);
      cols = `<details class="imp-sec" ${sess.colsOpen ? 'open' : ''} data-imp-open="cols"><summary>Kolumner <span class="muted small">– ${sess.mapping.filter(x => x !== 'ignore').length} av ${sess.mapping.length} används</span></summary>
        ${sess.guessed === 'content' ? '<p class="small warn-text"><b>Ingen rubrikrad hittades</b> – appen har gissat utifrån vad som står i cellerna. Kontrollera att kolumnerna stämmer.</p>' : ''}
        ${sess.guessed === 'saved' ? '<p class="small good-text">✓ Samma kolumnordning som du använde senast.</p>' : ''}
        <p class="small muted">Ändrar du en kolumn kommer appen ihåg ordningen till nästa gång du klistrar in en likadan tabell. En kolumn med <i>Önskemål (fritext)</i> kan innehålla både vem eleven vill och inte vill sitta med, och var i rummet – appen delar upp det.</p>
        <div class="colmap">${sess.headers.map((h, i) => `<div class="colm ${sess.mapping[i] === 'ignore' ? 'off' : ''}">
          <div class="colh" title="${esc(h)}">${esc(h || `Kolumn ${i + 1}`)}</div>
          <div class="cols small muted" title="${esc(sample[i] || '')}">${esc(String(sample[i] ?? '').slice(0, 40)) || '&nbsp;'}</div>
          <select data-imp-col="${i}">${kinds.map(([v, l]) => `<option value="${v}" ${sess.mapping[i] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</div>
        <label class="check small"><input type="checkbox" data-imp-header ${sess.hasHeader ? 'checked' : ''}> Första raden är rubriker</label>
      </details>`;
    }

    // --- Klasser ---
    let classes = '';
    if (sess.hasClassCol) {
      const { klass } = B();
      const k = klass(sess.classId);
      const gl = sess.groups.filter(g => g.key);
      classes = `<div class="imp-sec"><b class="small">Klasser i filen</b>
        <p class="small muted">${gl.map(g => `<span class="chip sm">${esc(g.label)} · ${g.entries.length}</span>`).join(' ')} – stora och små bokstäver och mellanslag spelar ingen roll ("7c" = "7C").</p>
        <label class="check"><input type="radio" name="impmode" value="this" ${sess.mode === 'this' ? 'checked' : ''}> Importera klass
          <select data-imp-group>${gl.map(g => `<option value="${esc(g.key)}" ${g.key === sess.pickGroup ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select>
          till <b>${esc(k.name)}</b></label>
        <label class="check"><input type="radio" name="impmode" value="all" ${sess.mode === 'all' ? 'checked' : ''}> Importera <b>alla klasser</b> – varje klass för sig ${T.some(t => t.isNew) && sess.mode === 'all' ? `<span class="small muted">(${T.filter(t => t.isNew).map(t => esc(t.klass.name)).join(', ')} skapas)</span>` : ''}</label>
        ${sess.mode === 'this' && sess.skipped ? `<p class="small muted">${sess.skipped} ${sess.skipped === 1 ? 'rad' : 'rader'} från andra klasser hoppas över.</p>` : ''}
      </div>`;
    }

    // --- Antal önskemål per elev ---
    const maxHtml = `<div class="imp-sec maxsec">${T.map(t => {
      const over = t.plan.items.filter(it => (it.entry.wishes || []).length > t.maxWishes).length;
      return `<div class="maxrow"><label class="small">Antal namngivna önskemål per elev${T.length > 1 ? ` i <b>${esc(t.klass.name)}</b>` : ''}
        <input type="number" min="0" max="10" class="numin" data-imp-max="${esc(t.tid)}" value="${t.maxWishes}"></label>
        ${over ? `<span class="small warn-text">${over} ${over === 1 ? 'elev önskar' : 'elever önskar'} fler – bara de ${t.maxWishes} första tas med. Höj siffran om alla ska med.</span>` : '<span class="small muted">Ändras även för klassen när du importerar.</span>'}</div>`;
    }).join('')}</div>`;

    // --- Rangordning ---
    const anyMulti = T.some(t => t.plan.items.some(it => (it.entry.wishes || []).length > 1));
    const ranked = sess.kind === 'table' && anyMulti ? `<div class="imp-sec"><label class="check small"><input type="checkbox" data-imp-ranked ${sess.ranked ? 'checked' : ''}> <span>Önskemålen står i <b>prioritetsordning</b> – första namnet är förstahandsvalet</span></label></div>` : '';

    // --- Liknande namn (nya elever som kanske redan finns) ---
    const sims = [];
    T.forEach(t => t.plan.similar.forEach(sm => sims.push({ t, sm })));
    const simHtml = sims.length ? `<div class="imp-sec warnsec"><b class="small">Finns de redan? (${sims.length})</b>
      <p class="small muted">De här namnen finns inte exakt i klassen, men liknar någon som redan finns.</p>
      ${sims.map(({ t, sm }) => {
        const cur = sess.resolutions[t.tid][sm.key] || 'new';
        return `<div class="unres"><span>»${esc(sm.name)}«${T.length > 1 ? ` <span class="muted small">(${esc(t.klass.name)})</span>` : ''}</span>
          <select data-imp-res="${esc(t.tid)}§${esc(sm.key)}"><option value="new" ${cur === 'new' ? 'selected' : ''}>Ny elev</option>${sm.candidates.map(c => `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>Samma som ${esc(nameIn(t, c.id))} (${c.why})</option>`).join('')}</select></div>`;
      }).join('')}</div>` : '';

    // --- Knappar som öppnar samma väljare som i klasslistan ---
    const edBtn = (it, kind, inner, extraCls = '') => `<button type="button" class="chipbox ${extraCls} ${it.edited && it.edited[kind === 'wishes' ? 'wish' : kind] ? 'edited' : ''}" data-imp-edit="${kind}" data-imp-item="${esc(it.reviewKey)}" title="Klicka för att ändra">${inner}</button>`;
    const wishInner = (t, it) => {
      const e = it.entry;
      const unr = t.plan.unresolved.filter(u => u.whoItem === it && u.kind === 'wish');
      const gen = (e.alone || e.wishGirl || e.wishBoy) ? generalChips({ alone: e.alone, wishGirl: e.wishGirl, wishBoy: e.wishBoy }) : '';
      if (it.wishIds === undefined && !gen && !unr.length) return it.isNew ? '<span class="add">+ Önska</span>' : '<span class="muted small">(behålls)</span>';
      const html = (it.wishIds || []).map((id, i) => `<span class="chip sm">${e.wishRanked ? `<span class="rk sm">${i + 1}</span>` : ''}${esc(nameIn(t, id))}</span>`).join(' ') + gen +
        unr.map(u => `<span class="chip sm unk" title="Att reda ut">${esc(u.token)} ?</span>`).join(' ') + (e.wishStrict ? '<span class="tag strict">strikt</span>' : '');
      return html.trim() || '<span class="add">+ Önska</span>';
    };
    const avoidInner = (t, it) => {
      const unr = t.plan.unresolved.filter(u => u.whoItem === it && u.kind === 'avoid');
      if (it.avoidIds === undefined && !unr.length) return it.isNew ? '<span class="add">+ Lägg till</span>' : '<span class="muted small">(behålls)</span>';
      const html = (it.avoidIds || []).map(id => `<span class="chip sm bad">${esc(nameIn(t, id))}</span>`).join(' ') + unr.map(u => ` <span class="chip sm unk">${esc(u.token)} ?</span>`).join('');
      return html.trim() || '<span class="add">+ Lägg till</span>';
    };
    const posInner = it => {
      const pos = it.entry.pos;
      if (pos === undefined) return it.isNew ? '<span class="add">+ Plats</span>' : '<span class="muted small">(behålls)</span>';
      if (!pos || !(pos.cells || []).length) return '<span class="add">+ Plats</span>';
      return `${miniGrid({ pos })} <span class="small">${esc(I().posToText(pos))}</span>${pos.strict ? '<span class="tag strict">strikt</span>' : ''}`;
    };
    const genderBtns = it => {
      const g = it.entry.gender !== undefined ? it.entry.gender : (it.existing ? it.existing.gender : '');
      return `<div class="seg sm">${[['', '–'], ['k', 'Kille'], ['t', 'Tjej']].map(([v, l]) => `<button type="button" class="${(g || '') === v ? 'on' : ''} ${v ? 'g-' + v : ''}" data-imp-gender="${v}" data-imp-item="${esc(it.reviewKey)}">${l}</button>`).join('')}</div>`;
    };

    // --- Att reda ut: en ruta per elev, med det eleven skrev och alla val ---
    // Rutan ligger kvar när något ändras, så att läraren ser resultatet. Den fälls ihop först med "Klar".
    const nUnresAll = T.reduce((a, t) => a + t.plan.unresolved.length, 0);
    const resolvedCount = T.reduce((a, t) => a + Object.keys(sess.resolutions[t.tid]).filter(x => !x.startsWith('self|')).length, 0);
    const pinnedItems = [];
    T.forEach(t => t.plan.items.forEach(it => { if (sess.pinned[it.reviewKey]) pinnedItems.push({ t, it, toks: Object.values(sess.pinned[it.reviewKey]) }); }));
    const nDone = pinnedItems.filter(x => sess.done[x.it.reviewKey]).length;
    const tokRow = (t, it, tk) => {
      const res = (sess.resolutions[tk.tid] || {})[tk.key] || '';
      const manual = tk.kind === 'wish' ? it.edited.wish : it.edited.avoid;
      const open = t.plan.unresolved.some(u => u.key === tk.key);
      return `<div class="unres ${open ? '' : 'ok'}"><span>${open ? '' : '<span class="good-text">✓</span> '}${tk.kind === 'wish' ? 'Vill sitta med' : 'Ska inte sitta med'} »${esc(tk.token)}«</span>
        ${manual ? '<span class="small muted">du har valt själv nedan</span>' : resSelect(`${tk.tid}§${tk.key}`, tk.candidates, allStudents(t), id => nameIn(t, id), res, tk.token)}</div>`;
    };
    const unresHtml = pinnedItems.length ? `<div class="imp-sec ${nUnresAll ? 'warnsec' : 'oksec'}"><div class="small"><b>Att reda ut ${nUnresAll ? `(${nUnresAll} kvar)` : '– allt kopplat'}</b>${pinnedItems.length > 1 ? ` <span class="muted">· ${nDone} av ${pinnedItems.length} elever klara</span>` : ''}</div>
      <p class="small muted">Namn som inte gick att koppla till en elev – stavfel, smeknamn eller sådant som inte är ett namn. Välj vem som menas i rullistan, eller klicka på önskemålen, "inte med" eller platsen för att ändra själv. Eleven ligger kvar här så att du ser resultatet – tryck <b>✓ Klar</b> när allt ser rätt ut. Det du inte bestämmer hamnar i listan <i>Att reda ut</i> i klassen.</p>
      ${pinnedItems.map(({ t, it, toks }) => {
        const left = t.plan.unresolved.filter(u => u.whoItem === it).length;
        if (sess.done[it.reviewKey]) return `<div class="ru-card done"><div class="ru-left"><span class="good-text">✓</span> <b>${esc(it.entry.name)}</b> <span class="small muted">klar${left ? ` · ${left} sparas till senare` : ''}</span></div>
          <div class="ru-right ru-sum"><span class="small">${wishInner(t, it)}</span><button type="button" class="linkbtn" data-imp-done="${esc(it.reviewKey)}">Visa igen</button></div></div>`;
        return `<div class="ru-card ${left ? '' : 'allok'}">
        <div class="ru-left"><b>${esc(it.entry.name)}</b>${T.length > 1 ? ` <span class="muted small">(${esc(t.klass.name)})</span>` : ''}
          ${it.entry.answer ? `<div class="ru-ans">Eleven skrev: <q>${esc(it.entry.answer)}</q></div>` : ''}</div>
        <div class="ru-right">
          ${toks.map(tk => tokRow(t, it, tk)).join('')}
          <div class="ru-edit">
            <div><span class="small muted">Vill sitta med</span>${edBtn(it, 'wishes', wishInner(t, it))}</div>
            <div><span class="small muted">Ska inte sitta med</span>${edBtn(it, 'avoid', avoidInner(t, it))}</div>
            <div><span class="small muted">Plats</span>${edBtn(it, 'pos', posInner(it), 'posbox')}</div>
            <div class="ru-done"><button type="button" class="btn small-btn ${left ? '' : 'primary'}" data-imp-done="${esc(it.reviewKey)}" title="${left ? 'Det som inte är bestämt sparas i listan Att reda ut i klassen' : 'Allt ser rätt ut'}">✓ Klar</button></div>
          </div>
        </div></div>`;
      }).join('')}
      ${resolvedCount ? `<p class="small good-text">✓ ${resolvedCount} namn redda ut. <button type="button" class="linkbtn" data-imp-reset>Ångra mina val</button></p>` : ''}
      <label class="check small"><input type="checkbox" data-imp-remember ${sess.remember ? 'checked' : ''}> Kom ihåg mina val (t.ex. att "micke" = Mikael) till nästa import</label>
    </div>` : '';

    // --- Tabell ---
    const anyAnswer = T.some(t => t.plan.items.some(it => it.entry.answer));
    const ncol = 6 + (anyAnswer ? 1 : 0);
    const nReview = T.reduce((a, t) => a + t.plan.items.filter(i => i.review).length, 0);
    const rowsHtml = T.map(t => (T.length > 1 ? `<tr class="grp"><td colspan="${ncol}"><b>${esc(t.klass.name)}</b>${t.isNew ? ' <span class="tag">ny klass</span>' : ''} · ${t.plan.items.length} elever</td></tr>` : '') +
      t.plan.items.map(it => {
        const e = it.entry;
        const unr = t.plan.unresolved.filter(u => u.whoItem === it);
        return `<tr class="${it.review ? 'review' : e.problems.length || unr.length ? 'warn' : ''}">
          <td class="namecell"><input class="sname imp-name" data-imp-rename="${esc(I().nameKey(e.origName || e.name))}" value="${esc(e.name)}" title="Rätta namnet – t.ex. om eleven skrivit sitt smeknamn" aria-label="Namn">
            ${e.origName && e.origName !== e.name ? `<div class="small muted">eleven skrev <i>${esc(e.origName)}</i> · <button type="button" class="linkbtn" data-imp-unrename="${esc(I().nameKey(e.origName))}">ångra</button></div>` : ''}
            ${it.isNew ? '<span class="tag">ny</span>' : `<span class="tag upd" title="Finns redan som ${esc(it.student.name)}">uppdateras</span>`}</td>
          <td>${genderBtns(it)}</td>
          <td>${edBtn(it, 'wishes', wishInner(t, it))}</td>
          <td>${edBtn(it, 'avoid', avoidInner(t, it))}</td>
          <td>${edBtn(it, 'pos', posInner(it), 'posbox')}</td>
          ${anyAnswer ? `<td class="answer">${e.answer ? `<q>${esc(e.answer)}</q>` : '<span class="muted">–</span>'}${(e.notes || []).map(n => `<div class="small warn-text">⚠ ${esc(n)}</div>`).join('')}</td>` : ''}
          <td class="rv"><label class="rvbox" title="Eleven hamnar i listan Att granska i klassen, med sin text – så kan du titta på hen efter importen"><input type="checkbox" data-imp-review="${esc(it.reviewKey)}" ${it.review ? 'checked' : ''}> <span>Granska senare</span></label>
            ${!anyAnswer && (e.notes || []).length ? (e.notes || []).map(n => `<div class="small warn-text">⚠ ${esc(n)}</div>`).join('') : ''}
            ${it.review && it.entry.uncertain && !(it.reviewKey in sess.review) ? '<div class="small muted">ikryssad av appen</div>' : ''}</td></tr>`;
      }).join('')).join('');

    m.innerHTML = `<form method="dialog" class="modal import-preview">
      <h3>Förhandsgranska import</h3>
      <p class="small">${sess.source === 'text' ? 'Från textrutan' : 'Från <b>' + esc(sess.source) + '</b>'}: <b>${nItems}</b> elever${T.length > 1 ? ` i <b>${T.length}</b> klasser` : ''} – ${nNew} nya, ${nItems - nNew} som redan finns och uppdateras.${nUnres ? ` <span class="bad-text">${nUnres} namn att reda ut.</span>` : ''}${nReview ? ` <span class="warn-text">${nReview} markerade att granska senare.</span>` : ''}</p>
      ${cols}${classes}${maxHtml}${ranked}${simHtml}${unresHtml}
      ${probs.length ? `<div class="gbox warn"><b>Kontrollera ${probs.length} ${probs.length === 1 ? 'sak' : 'saker'}</b><ul class="small">${probs.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}
      <div class="legend small">
        <div><b class="bad-text">Att reda ut</b> (rutan ovanför) – namn appen <i>inte kunde koppla</i> till en elev. De måste bestämmas: nu, eller senare i klassens lista <i>Att reda ut</i>.</div>
        <div><b class="warn-text">Granska senare</b> (kryssrutan i listan) – ett bokmärke för dig. Eleven hamnar i listan <i>Att granska</i> i klassen, med sin text, så att du kan titta en gång till efter importen. Appen kryssar i den själv när den inte förstod allt eleven skrev (⚠), t.ex. "vid fönstret". Allt i listan importeras ändå.</div>
      </div>
      <div class="table-wrap preview-table"><table class="list-table"><thead><tr><th>Namn</th><th>Kön</th><th>Vill sitta med</th><th>Ska inte sitta med</th><th>Plats i rummet</th>${anyAnswer ? '<th>Eleven skrev</th>' : ''}<th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="${ncol}" class="muted">Inga elever att importera – kontrollera kolumnerna.</td></tr>`}</tbody></table></div>
      <p class="small muted">Klicka på kön, önskemål, "inte med" eller plats för att ändra direkt – precis som i klasslistan. Ändrade rutor får en blå kant.</p>
      ${anyAnswer ? '<p class="small muted">Det som står under <i>Eleven skrev</i> sparas på eleven, så du kan se det i klasslistan även efteråt.</p>' : ''}
      <div class="row between"><button class="btn ghost" value="cancel">Avbryt</button><button type="button" class="btn primary" data-imp-do ${nItems ? '' : 'disabled'}>Importera ${nItems} ${nItems === 1 ? 'elev' : 'elever'}${nUnres ? ` (${nUnres} att reda ut sparas)` : ''}</button></div>
    </form>`;
    m.querySelectorAll('details[data-imp-open]').forEach(d => d.addEventListener('toggle', () => { sess.colsOpen = d.open; }));
  }

  // Valruta: förslag först, sedan alla elever A–Ö
  function resSelect(key, candidates, students, nameOf, current, token) {
    const { esc } = B();
    const cand = (candidates || []).map(c => (typeof c === 'string' ? { id: c } : c));
    return `<select data-imp-res="${esc(key)}"><option value="">– bestäm senare –</option>
      ${cand.length ? `<optgroup label="Förslag">${cand.map(c => `<option value="${c.id}" ${current === c.id ? 'selected' : ''}>${esc(nameOf(c.id))}${c.why ? ` (${c.why})` : ''}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Alla elever">${students.map(s => `<option value="${s.id}" ${current === s.id && !cand.some(c => c.id === s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>
      ${token ? `<option value="add">Ny elev: »${esc(niceName(token))}« (har inte svarat själv)</option>` : ''}
      <option value="skip" ${current === 'skip' ? 'selected' : ''}>Hoppa över (inget namn)</option></select>`.replace('<option value="add">', `<option value="add" ${current === 'add' ? 'selected' : ''}>`);
  }

  function rename(key, value) {
    const v = niceName(String(value || '').trim().replace(/\s+/g, ' '));
    if (!v || I().nameKey(v) === key) delete sess.renames[key]; else sess.renames[key] = v;
    compute(); draw();
  }

  function onModalChange(e) {
    const t = e.target;
    if (!sess) return;
    if (t.matches('[data-imp-col], [data-imp-header], [name=impmode], [data-imp-group]')) { sess.pinned = {}; sess.done = {}; }
    if (t.matches('[data-imp-max]')) { const n = Math.max(0, Math.min(10, parseInt(t.value, 10) || 0)); sess.maxW[t.dataset.impMax] = n; compute(); draw(); return; }
    if (t.matches('[data-imp-rename]')) { rename(t.dataset.impRename, t.value); return; }
    if (t.matches('[data-imp-col]')) { sess.mapping[+t.dataset.impCol] = t.value; sess.guessed = 'manual'; rememberMapping(); compute(); draw(); return; }
    if (t.matches('[data-imp-review]')) { sess.review[t.dataset.impReview] = t.checked; compute(); draw(); return; }
    if (t.matches('[data-imp-header]')) {
      sess.hasHeader = t.checked;
      if (!t.checked) sess.headers = sess.headers.map((_, i) => `Kolumn ${i + 1}`);
      else sess.headers = (sess.rows[0] || []).map(c => String(c ?? '').trim());
      compute(); draw(); return;
    }
    if (t.name === 'impmode') { sess.mode = t.value; compute(); draw(); return; }
    if (t.matches('[data-imp-group]')) { sess.pickGroup = t.value; sess.mode = 'this'; compute(); draw(); return; }
    if (t.matches('[data-imp-ranked]')) { sess.ranked = t.checked; compute(); draw(); return; }
    if (t.matches('[data-imp-remember]')) { sess.remember = t.checked; B().ui.rememberAlias = t.checked; return; }
    if (t.matches('[data-imp-res]')) {
      const [tid, key] = t.dataset.impRes.split('§');
      const r = sess.resolutions[tid] || (sess.resolutions[tid] = {});
      if (t.value === 'add') {
        const u = sess.targets.flatMap(x => x.plan.unresolved).find(x => x.key === key);
        if (u) sess.addNames[tid + '§' + key] = u.token;
      }
      if (t.value) r[key] = t.value; else delete r[key];
      compute(); draw();
    }
  }

  function onModalClick(e) {
    if (!sess) return;
    const ur = e.target.closest('[data-imp-unrename]');
    if (ur) { rename(ur.dataset.impUnrename, ''); return; }
    const dn = e.target.closest('[data-imp-done]');
    if (dn) { const rk = dn.dataset.impDone; if (sess.done[rk]) delete sess.done[rk]; else sess.done[rk] = true; draw(); return; }
    const ed = e.target.closest('[data-imp-edit]');
    if (ed) { openEdit(ed.dataset.impItem, ed.dataset.impEdit); return; }
    const gb = e.target.closest('[data-imp-gender]');
    if (gb) {
      const f = findItem(gb.dataset.impItem);
      if (!f) return;
      const cur = f.it.entry.gender !== undefined ? f.it.entry.gender : (f.it.existing ? f.it.existing.gender : '');
      const x = sess.edits[gb.dataset.impItem] || (sess.edits[gb.dataset.impItem] = {});
      x.gender = gb.dataset.impGender;
      compute(); draw(); return;
    }
    if (e.target.closest('[data-imp-reset]')) { Object.keys(sess.resolutions).forEach(k => { sess.resolutions[k] = {}; }); compute(); draw(); return; }
    if (!e.target.closest('[data-imp-do]')) return;
    const { S, save, render, toast, ui } = B();
    let nNew = 0, nUpd = 0, nUnres = 0;
    const created = [];
    sess.targets.forEach(t => {
      if (t.isNew) { S.classes.push(t.klass); created.push(t.klass.name); }
      if (sess.maxW[t.tid] !== undefined) t.klass.maxWishes = sess.maxW[t.tid];
      I().apply(t.klass, t.plan, sess.resolutions[t.tid], sess.remember);
      // Rättade namn sparas som smeknamn i klassen (om "Kom ihåg" är ikryssat).
      if (sess.remember) t.plan.items.forEach(it => {
        const o = it.entry.origName;
        if (o && I().nameKey(o) !== I().nameKey(it.student.name)) { t.klass.aliases = t.klass.aliases || {}; t.klass.aliases[I().nameKey(o)] = it.student.id; }
      });
      autoResolve(t.klass);
      nNew += t.plan.items.filter(i => i.isNew).length;
      nUpd += t.plan.items.filter(i => !i.isNew).length;
      nUnres += t.plan.unresolved.length;
    });
    if (sess.source === 'text' || sess.source === 'inklistrad tabell') ui.bulkDraft = '';
    ui.addOpen = false;
    save();
    $('#modal').close();
    render();
    toast(`${nNew} nya, ${nUpd} uppdaterade${created.length ? ` · ny klass: ${created.join(', ')}` : ''}${nUnres ? ` · ${nUnres} att reda ut` : ''}.`);
  }

  // =====================================================================
  // I klassen: "Att reda ut" och sparade smeknamn
  // =====================================================================
  function classExtras(k) {
    const { esc, ui } = B();
    const sById = new Map(k.students.map(s => [s.id, s]));
    k.unresolved = (k.unresolved || []).filter(u => sById.has(u.from));
    const nm = id => (sById.get(id) || {}).name || '?';
    const sorted = k.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    let html = '';
    if (k.unresolved.length) {
      html += `<div class="unres-card">
        <div class="row between"><b>Att reda ut (${k.unresolved.length})</b><button class="btn ghost small-btn" data-unres-clear>Hoppa över alla</button></div>
        <p class="small muted">Namn från importen som inte gick att koppla till en elev. Välj vem som menas – så läggs önskemålet till.</p>
        ${k.unresolved.map(u => {
          const fresh = window.Import.matcher(k.students, k.aliases || {}).match(u.token);
          const cands = (u.candidates || []).filter(id => sById.has(id)).map(id => ({ id }));
          (fresh.candidates || []).forEach(c => { if (!cands.some(x => x.id === c.id)) cands.push(c); });
          return `<div class="unres"><span><b>${esc(nm(u.from))}</b> ${u.kind === 'wish' ? 'vill sitta med' : 'ska inte sitta med'} »${esc(u.token)}«${sById.get(u.from)?.answer ? `<br><span class="small muted">Eleven skrev: <q>${esc(sById.get(u.from).answer.text)}</q></span>` : ''}</span>
            ${resSelect('k§' + u.id, cands.filter(c => c.id !== u.from), sorted.filter(s => s.id !== u.from), nm, '', u.token)}</div>`;
        }).join('')}
        <label class="check small"><input type="checkbox" data-unres-remember ${ui.rememberAlias !== false ? 'checked' : ''}> Kom ihåg mina val till nästa import</label>
      </div>`;
    }
    const al = Object.entries(k.aliases || {}).filter(([, id]) => sById.has(id));
    if (al.length) {
      html += `<details class="add-box aliases"><summary>Smeknamn och stavningar som appen känner igen (${al.length})</summary>
        <p class="small muted">Sparade när du har rett ut namn vid import. Vid nästa import kopplas de automatiskt till rätt elev.</p>
        <div class="chips">${al.sort((a, b) => a[0].localeCompare(b[0], 'sv')).map(([tok, id]) => `<span class="chip">»${esc(tok)}« = ${esc(nm(id))} <button class="xbtn" data-alias-del="${esc(tok)}" title="Glöm">×</button></span>`).join('')}</div>
      </details>`;
    }
    return html;
  }

  function onClassClick(e, k) {
    const { save, render } = B();
    const del = e.target.closest('[data-alias-del]');
    if (del) { delete k.aliases[del.dataset.aliasDel]; save(); render(); return true; }
    if (e.target.closest('[data-unres-clear]')) {
      if (!confirm('Hoppa över alla namn i listan "Att reda ut"?')) return true;
      k.unresolved = []; save(); render(); return true;
    }
    return false;
  }

  function onClassChange(e, k) {
    const { save, render, toast, ui } = B();
    const t = e.target;
    if (t.matches('[data-unres-remember]')) { ui.rememberAlias = t.checked; return true; }
    if (!t.matches('[data-imp-res]') || !t.dataset.impRes.startsWith('k§')) return false;
    const uid = t.dataset.impRes.slice(2);
    const u = k.unresolved.find(x => x.id === uid);
    if (!u || !t.value) return true;
    let val = t.value;
    if (val === 'add') {
      const exists = k.students.find(x => window.Import.nameKey(x.name) === window.Import.nameKey(u.token));
      const ns = exists || { id: B().uid(), name: niceName(u.token), gender: '', wishes: [], avoid: [] };
      if (!exists) k.students.push(ns);
      val = ns.id;
    }
    if (val !== 'skip') {
      const s = k.students.find(x => x.id === u.from);
      const list = u.kind === 'wish' ? (s.wishes = s.wishes || []) : (s.avoid = s.avoid || []);
      const max = k.maxWishes ?? 3;
      if (u.kind === 'wish' && list.length >= max && !list.includes(val)) {
        toast(`${s.name} har redan ${max} önskemål – öka "Max antal önskemål" eller ta bort ett först.`);
        render(); return true;
      }
      if (!list.includes(val) && val !== s.id) {
        if (u.kind === 'wish' && s.wishRanked) list.splice(Math.min(u.rank || 0, list.length), 0, val); else list.push(val);
      }
      if (ui.rememberAlias !== false) {
        k.aliases = k.aliases || {};
        const key = window.Import.nameKey(u.token);
        const st = k.students.find(x => x.id === val);
        if (st && window.Import.nameKey(st.name) !== key) k.aliases[key] = val;
      }
    }
    k.unresolved = k.unresolved.filter(x => x !== u);
    const more = autoResolve(k);
    save(); render();
    if (more) toast(`${more} till löstes av sig själv${more === 1 ? '' : 'a'} (samma namn).`);
    return true;
  }

  // Löser poster i "Att reda ut" som nu går att koppla – t.ex. efter att ett smeknamn sparats
  // eller en elev lagts till. Returnerar antal lösta.
  function addTo(k, u, id) {
    const s = k.students.find(x => x.id === u.from);
    if (!s || id === s.id) return false;
    const list = u.kind === 'wish' ? (s.wishes = s.wishes || []) : (s.avoid = s.avoid || []);
    if (list.includes(id)) return true;
    if (u.kind === 'wish' && list.length >= (k.maxWishes ?? 3)) return false;
    if (u.kind === 'wish' && s.wishRanked) list.splice(Math.min(u.rank || 0, list.length), 0, id); else list.push(id);
    return true;
  }
  function autoResolve(k) {
    if (!(k.unresolved || []).length) return 0;
    const M = window.Import.matcher(k.students, k.aliases || {});
    let n = 0;
    k.unresolved = k.unresolved.filter(u => {
      const m = M.match(u.token);
      if (m.ids.length && m.ids.every(id => addTo(k, u, id))) { n++; return false; }
      return true;
    });
    return n;
  }

  return { open, classExtras, onClassClick, onClassChange };
})();
