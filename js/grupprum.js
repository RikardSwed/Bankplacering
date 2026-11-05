/* Bänkplacering – grupprum
 * Grupper, lottning av vilket rum varje grupp får, och ett cirkulationsschema
 * som gör att lottningen tar hänsyn till var eleverna suttit tidigare.
 * Helt fristående från bänklottningen – läser bara klasser, klassrum och
 * sparade placeringar.
 */
window.Grupprum = (() => {
  'use strict';

  const B = () => window.BP;
  const $ = (s, r = document) => r.querySelector(s);
  const MAIN = 'main';
  const COLORS = ['#f4a259', '#5b9e8a', '#7fa8d6', '#e07a95', '#a98fd6', '#e3b94a', '#7fb069', '#ef8a7d', '#5fa3ad', '#c4a35a', '#b08a7a', '#8fa3b0'];
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const label = i => (i < 26 ? LETTERS[i] : String(i + 1));
  const openDetails = {};

  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const fmtDay = iso => { try { return new Date(iso + 'T12:00').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return iso; } };
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- Tillstånd ----------
  function sourcePlacement(c) {
    const { S, room } = B();
    if (!c.sourceId) return null;
    if (c.sourceId === 'current') {
      const cc = S.current;
      if (cc && cc.classId === c.classId && room(cc.roomId) && Object.keys(cc.assignment || {}).length) {
        return { roomId: cc.roomId, assignment: cc.assignment, absent: cc.absent || [], name: 'Aktuell lottning' };
      }
      return null;
    }
    const r = S.results.find(x => x.id === c.sourceId && x.classId === c.classId);
    return r && room(r.roomId) ? { roomId: r.roomId, assignment: r.assignment, absent: r.absent || [], name: r.name } : null;
  }

  function cur() {
    const { S, klass, room } = B();
    if (!S.gr.cur) S.gr.cur = {};
    const c = S.gr.cur;
    if (!klass(c.classId)) Object.assign(c, { classId: S.classes[0]?.id || null, sourceId: '', groups: [], absent: [], active: null });
    c.groups = c.groups || []; c.absent = c.absent || []; c.unavailable = c.unavailable || []; c.caps = c.caps || {};
    if (c.sourceId && !sourcePlacement(c)) c.sourceId = '';
    const p = sourcePlacement(c);
    if (p) c.roomId = p.roomId;
    if (!room(c.roomId)) c.roomId = S.rooms[0]?.id || null;
    const k = klass(c.classId);
    if (k) {
      const ids = new Set(k.students.map(s => s.id));
      c.absent = c.absent.filter(id => ids.has(id));
      c.groups.forEach(g => { g.studentIds = g.studentIds.filter(id => ids.has(id) && !c.absent.includes(id)); });
    }
    if (c.active && !c.groups.some(g => g.id === c.active)) c.active = null;
    return c;
  }
  const changed = c => { c.savedId = null; };

  function locations(c, r) {
    const list = [{ id: MAIN, name: 'Klassrummet', main: true, baseCap: r.mainMaxGroups || null }];
    (r.groupRooms || []).forEach(g => list.push({ id: g.id, name: g.name, main: false, baseCap: g.maxGroups || 1 }));
    list.forEach(l => {
      l.available = l.main || !c.unavailable.includes(l.id);
      l.cap = c.caps[l.id] != null ? c.caps[l.id] : l.baseCap;
    });
    return list;
  }

  // Historik för en klass: hur många gånger varje elev suttit var, och var senast.
  function stats(classId, excludeId) {
    const { S } = B();
    const hist = S.gr.history.filter(h => h.classId === classId && h.id !== excludeId)
      .sort((a, b) => (a.date + a.created).localeCompare(b.date + b.created));
    const count = new Map(), last = new Map(), lastDate = new Map(), names = {};
    hist.forEach(h => {
      Object.assign(names, h.locNames || {});
      h.groups.forEach(g => g.studentIds.forEach(sid => {
        if (!count.has(sid)) count.set(sid, {});
        const m = count.get(sid);
        m[g.loc] = (m[g.loc] || 0) + 1;
        last.set(sid, g.loc); lastDate.set(sid, h.date);
      }));
    });
    return { hist, count, last, lastDate, names };
  }

  // ---------- Grupper ----------
  function newGroup(c, ids = []) {
    const usedN = new Set(c.groups.map(g => g.name));
    let i = 0; while (usedN.has('Grupp ' + label(i))) i++;
    const usedC = new Set(c.groups.map(g => g.color));
    let ci = 0; while (usedC.has(ci) && ci < COLORS.length) ci++;
    if (ci >= COLORS.length) ci = c.groups.length % COLORS.length;
    const g = { id: B().uid(), name: 'Grupp ' + label(i), color: ci, studentIds: ids, loc: null };
    c.groups.push(g);
    return g;
  }
  function replaceGroups(c, lists) {
    c.groups = []; c.active = null;
    lists.filter(l => l.length).forEach(l => newGroup(c, l));
    changed(c);
  }
  // Delar en lista i grupper på ungefär k elever, så jämnt som möjligt.
  function chunk(list, k) {
    const m = Math.max(1, Math.round(list.length / k));
    const out = [];
    let i = 0;
    for (let g = 0; g < m; g++) {
      const size = Math.floor(list.length / m) + (g < list.length % m ? 1 : 0);
      out.push(list.slice(i, i + size)); i += size;
    }
    return out.filter(x => x.length);
  }
  function mergeSingles(groups) {
    const out = [];
    groups.forEach(g => {
      if (g.length === 1 && out.length) out[out.length - 1].push(...g);
      else out.push(g.slice());
    });
    if (out.length > 1 && out[0].length === 1) { out[1].unshift(...out[0]); out.shift(); }
    return out;
  }
  const presentIds = c => B().klass(c.classId).students.filter(s => !c.absent.includes(s.id)).map(s => s.id);

  function fromPlacement(c, size) {
    const p = sourcePlacement(c);
    if (!p) return;
    const r = B().room(p.roomId);
    const geo = Lottning.geometry(r);
    const present = new Set(presentIds(c));
    const at = geo.seats.map(s => { const id = p.assignment[s.id]; return present.has(id) ? id : null; });
    let groups = [];
    if (size === 'cluster') {
      const parent = geo.seats.map((_, i) => i);
      const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      geo.seats.forEach((s, i) => { [geo.partner[i], ...geo.neigh[i]].forEach(j => { parent[find(i)] = find(j); }); });
      const comp = new Map();
      geo.seats.forEach((s, i) => {
        if (!at[i]) return;
        const key = find(i);
        if (!comp.has(key)) comp.set(key, []);
        comp.get(key).push({ id: at[i], x: s.x, y: s.y });
      });
      groups = [...comp.values()]
        .sort((a, b) => a[0].y - b[0].y || a[0].x - b[0].x)
        .map(list => list.sort((a, b) => a.y - b.y || a.x - b.x).map(o => o.id));
    } else {
      const rows = new Map();
      geo.seats.forEach((s, i) => {
        if (!at[i]) return;
        if (!rows.has(s.y)) rows.set(s.y, []);
        rows.get(s.y).push({ id: at[i], x: s.x });
      });
      [...rows.keys()].sort((a, b) => a - b).forEach(y => {
        groups.push(...chunk(rows.get(y).sort((a, b) => a.x - b.x).map(o => o.id), size));
      });
    }
    replaceGroups(c, mergeSingles(groups));
  }

  function clickStudent(c, sid) {
    const from = c.groups.find(g => g.studentIds.includes(sid));
    const act = c.groups.find(g => g.id === c.active);
    if (act && from !== act) {
      if (from) from.studentIds = from.studentIds.filter(x => x !== sid);
      act.studentIds.push(sid);
    } else if (from) {
      from.studentIds = from.studentIds.filter(x => x !== sid);
    } else {
      c.active = newGroup(c, [sid]).id;
    }
    changed(c);
  }

  // ---------- Lottning av rum ----------
  function lotta(c, r) {
    const groups = c.groups.filter(g => g.studentIds.length);
    if (!groups.length) return 'Skapa minst en grupp först.';
    const locs = locations(c, r).filter(l => l.available);
    const slots = [];
    locs.forEach((l, li) => {
      const cap = l.cap == null ? groups.length : Math.min(l.cap, groups.length);
      for (let i = 0; i < cap; i++) slots.push(li);
    });
    if (slots.length < groups.length) {
      return `Det finns ${groups.length} grupper men bara plats för ${slots.length}. Öka "max grupper" eller markera fler rum som lediga.`;
    }
    const k = B().klass(c.classId);
    const sById = new Map(k.students.map(s => [s.id, s]));
    const st = stats(c.classId);
    const G = groups.length, n = slots.length;
    // Kostnad för att grupp g hamnar på plats l. Lägre = bättre.
    const cost = groups.map(g => locs.map(l => {
      let sum = Math.random() * 6; // lite slump så att lika bra alternativ varierar
      g.studentIds.forEach(sid => {
        const s = sById.get(sid) || {};
        if (s.grStay) { if (!l.main) sum += 300; return; }
        if (s.grPromise && l.main) sum += 400;
        if (st.last.get(sid) === l.id) sum += l.main ? 400 : 1000; // satt här senast
        sum += 15 * ((st.count.get(sid) || {})[l.id] || 0);      // varit här många gånger
      });
      return sum / g.studentIds.length; // snitt per elev – stora och små grupper väger lika
    }));
    const total = perm => {
      let s = 0;
      const used = new Set();
      for (let g = 0; g < G; g++) { const li = slots[perm[g]]; s += cost[g][li]; used.add(li); }
      locs.forEach((l, li) => { if (!l.main && !used.has(li)) s += 200; }); // använd lediga grupprum
      return s;
    };
    let best = null, bestS = Infinity;
    for (let r0 = 0; r0 < 150; r0++) {
      const perm = shuffle([...Array(n).keys()]);
      let cs = total(perm);
      for (let it = 0; it < 400; it++) {
        const i = Math.floor(Math.random() * G), j = Math.floor(Math.random() * n);
        if (i === j) continue;
        [perm[i], perm[j]] = [perm[j], perm[i]];
        const ns = total(perm);
        if (ns <= cs) cs = ns; else [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      if (cs < bestS) { bestS = cs; best = perm.slice(); }
    }
    groups.forEach((g, gi) => { g.loc = locs[slots[best[gi]]].id; });
    changed(c);
    return null;
  }

  // ---------- Rendering ----------
  function render(v) {
    const { S, esc, klass, room, roomGrid, ui } = B();
    if (!S.classes.length || !S.rooms.length) {
      v.innerHTML = `<section class="card empty"><h2>Grupprum</h2>
        <p>Här delar du in klassen i grupper och lottar vilken grupp som får sitta i vilket grupprum. Du behöver först ett <b>klassrum</b> (med grupprum kopplade till sig) och en <b>klass</b>.</p>
        <div class="row wrap gap"><button class="btn primary" data-go="klassrum">Skapa klassrum</button><button class="btn" data-go="klasser">Skapa klass</button></div></section>`;
      return;
    }
    const c = cur();
    const k = klass(c.classId), r = room(c.roomId);
    const p = sourcePlacement(c);
    const locs = locations(c, r);
    const avail = locs.filter(l => l.available);
    const st = stats(c.classId);
    const sById = new Map(k.students.map(s => [s.id, s]));
    const nm = id => sById.get(id)?.name || '?';
    const locName = id => locs.find(l => l.id === id)?.name || st.names[id] || '(borttaget rum)';
    const inGroup = new Map();
    c.groups.forEach(g => g.studentIds.forEach(id => inGroup.set(id, g)));
    const present = k.students.filter(s => !c.absent.includes(s.id));
    const pool = present.filter(s => !inGroup.has(s.id));
    const opt = (val, curV, text) => `<option value="${esc(val)}" ${val === curV ? 'selected' : ''}>${esc(text)}</option>`;
    const gcol = g => COLORS[g.color % COLORS.length];

    // Källor
    const results = S.results.filter(x => x.classId === c.classId && room(x.roomId));
    const hasCurrent = S.current && S.current.classId === c.classId && room(S.current.roomId) && Object.keys(S.current.assignment || {}).length;
    const srcOpts = opt('', c.sourceId, 'Ingen – bara klassrum') +
      (hasCurrent ? opt('current', c.sourceId, 'Aktuell lottning (fliken Lottning)') : '') +
      results.map(x => opt(x.id, c.sourceId, x.name)).join('');

    // Rum idag
    const capTxt = l => (l.cap == null ? 'alla' : l.cap);
    const totalCap = avail.reduce((a, l) => a + (l.cap == null ? Infinity : l.cap), 0);
    const locRow = locs.map(l => `
      <div class="loc ${l.available ? '' : 'off'}">
        <button class="loc-toggle" data-gloc="${l.id}" ${l.main ? 'disabled' : ''} title="${l.main ? 'Klassrummet är alltid tillgängligt' : 'Klicka för att växla ledigt/upptaget'}">
          ${esc(l.name)}<small>${l.main ? 'alltid' : l.available ? 'ledigt' : 'upptaget'}</small></button>
        <label title="Max antal grupper i rummet idag">max <input type="number" min="1" max="20" value="${l.cap == null ? '' : l.cap}" placeholder="alla" data-gcap="${l.id}" ${l.available ? '' : 'disabled'}></label>
      </div>`).join('');

    // Karta
    const seatHTML = seatId => {
      const sid = p.assignment[seatId];
      if (!sid || !sById.has(sid) || c.absent.includes(sid)) return '<div class="seat empty gempty"></div>';
      const g = inGroup.get(sid);
      return `<div class="seat filled gseat ${g ? 'ing' : ''} ${g && g.id === c.active ? 'act' : ''}" data-gstudent="${sid}" ${g ? `style="--gc:${gcol(g)}"` : ''}>` +
        `<span class="nm">${esc(nm(sid))}</span>${g ? `<span class="gtag">${esc(g.name.replace('Grupp ', ''))}</span>` : ''}</div>`;
    };

    // Gruppkort
    const cards = c.groups.map(g => {
      const locOk = g.loc && avail.some(l => l.id === g.loc);
      return `<div class="gcard ${g.id === c.active ? 'active' : ''}" data-ggroup="${g.id}" style="--gc:${gcol(g)}">
        <div class="gcard-head"><span class="gdot"></span><b>${esc(g.name)}</b><span class="muted small">${g.studentIds.length} st</span>
          <button class="icon danger" data-gdel="${g.id}" title="Ta bort gruppen">×</button></div>
        <div class="chips">${g.studentIds.map(id => `<button class="chip gs" data-gstudent="${id}">${esc(nm(id))}</button>`).join('') || '<span class="muted small">Tom – klicka på elever för att lägga till.</span>'}</div>
        <label class="small muted row">Rum <select data-gassign="${g.id}">${opt('', locOk ? g.loc : '', '– inte lottat –')}${avail.map(l => opt(l.id, locOk ? g.loc : '', l.name)).join('')}</select></label>
      </div>`;
    }).join('');

    // Resultat
    const active = c.groups.filter(g => g.studentIds.length);
    const allPlaced = active.length && active.every(g => g.loc && avail.some(l => l.id === g.loc));
    let resultHTML = '';
    if (allPlaced) {
      const prev = stats(c.classId, c.savedId); // jämför med tillfällena före detta
      const notes = [];
      active.forEach(g => g.studentIds.forEach(sid => {
        const s = sById.get(sid), here = locs.find(l => l.id === g.loc);
        if (s.grStay && !here.main) notes.push(`${s.name} vill helst stanna i klassrummet men hamnade i ${here.name}.`);
        else if (s.grPromise && here.main) notes.push(`${s.name} är lovad grupprum men blev kvar i klassrummet.`);
        else if (!s.grStay && !here.main && prev.last.get(sid) === g.loc) notes.push(`${s.name} satt i ${here.name} förra gången också.`);
      }));
      const over = avail.filter(l => l.cap != null && active.filter(g => g.loc === l.id).length > l.cap);
      over.forEach(l => notes.push(`${l.name} har fler grupper än max (${l.cap}).`));
      resultHTML = `
        <div class="locs-result">${avail.map(l => {
          const here = active.filter(g => g.loc === l.id);
          return `<div class="lres ${l.main ? 'main' : ''}"><h4>${esc(l.name)}</h4>${here.map(g =>
            `<div><span class="gdot" style="--gc:${gcol(g)}"></span> <b>${esc(g.name)}:</b> ${g.studentIds.map(id => esc(nm(id))).join(', ')}</div>`).join('') || '<div class="muted">–</div>'}</div>`;
        }).join('')}</div>
        ${notes.length ? `<ul class="notes small">${notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small good-text">✓ Ingen hamnade i samma grupprum som förra gången.</p>'}
        <div class="row wrap gap save-row no-print">
          <label class="field">Datum <input type="date" id="g-date" value="${today()}"></label>
          <label class="field grow">Anteckning (valfri) <input id="g-note" placeholder="t.ex. Lektion 2 – skrivuppgift"></label>
          ${c.savedId ? '<span class="good-text small"><b>✓ Sparat i schemat</b></span>' : '<button class="btn primary" data-gaction="save">Spara tillfället i schemat</button>'}
        </div>`;
    } else if (active.length) {
      resultHTML = '<p class="hint">Tryck på <b>Lotta rum</b> – eller välj rum för varje grupp själv i grupprutorna.</p>';
    }

    // Cirkulationsschema
    const locIds = locs.map(l => l.id);
    st.count.forEach(m => Object.keys(m).forEach(id => { if (!locIds.includes(id)) locIds.push(id); }));
    let sched = '<p class="muted">Inga sparade tillfällen ännu. När du sparar ett tillfälle räknas det in här, och nästa lottning tar hänsyn till var eleverna suttit.</p>';
    if (st.hist.length) {
      const rowsH = k.students.map(s => {
        const m = st.count.get(s.id) || {};
        const totGR = Object.entries(m).filter(([id]) => id !== MAIN).reduce((a, [, n]) => a + n, 0);
        const last = st.last.get(s.id);
        return `<tr><td>${esc(s.name)}${s.grStay ? ' <span class="muted small" title="Stannar hellre i klassrummet">⌂</span>' : ''}${s.grPromise ? ' <span class="small" title="Lovad grupprum">★</span>' : ''}</td>
          ${locIds.map(id => { const n = m[id] || 0; return `<td class="c ${n ? '' : 'zero'} ${last === id ? 'last' : ''}">${n}</td>`; }).join('')}
          <td class="c"><b>${totGR}</b></td>
          <td class="small muted">${last ? esc(locName(last)) + ', ' + fmtDay(st.lastDate.get(s.id)) : '–'}</td></tr>`;
      }).join('');
      const histList = st.hist.slice().reverse().map(h => `
        <div class="hist-item"><div><b>${fmtDay(h.date)}</b>${h.note ? ` · ${esc(h.note)}` : ''}<div class="small muted">${
          h.groups.filter(g => g.loc !== MAIN).map(g => `${esc((h.locNames || {})[g.loc] || locName(g.loc))}: ${g.studentIds.map(id => esc(nm(id))).join(', ')}`).join(' · ') || 'Alla i klassrummet'
        }</div></div><button class="icon danger" data-ghdel="${h.id}" title="Ta bort tillfället">×</button></div>`).join('');
      sched = `<div class="table-wrap"><table class="list-table sched"><thead><tr><th>Elev</th>${locIds.map(id => `<th class="c">${esc(locName(id))}</th>`).join('')}<th class="c">Grupprum totalt</th><th>Senast</th></tr></thead><tbody>${rowsH}</tbody></table></div>
        <p class="muted small">Siffrorna visar hur många gånger eleven suttit på varje plats. Markerad ruta = där eleven satt senast.</p>
        <details class="add-box" data-gdetails="hist" ${openDetails.hist ? 'open' : ''}><summary>Tidigare tillfällen (${st.hist.length})</summary>${histList}</details>`;
    }

    const lastEntry = st.hist[st.hist.length - 1];
    const sizeOpt = (n, sel) => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}</option>`;

    v.innerHTML = `
      <section class="card">
        <div class="row wrap gap">
          <label class="field">Klass <select data-gfield="classId">${S.classes.map(x => opt(x.id, c.classId, x.name)).join('')}</select></label>
          <label class="field">Utgå från placering <select data-gfield="sourceId">${srcOpts}</select></label>
          <label class="field">Klassrum <select data-gfield="roomId" ${p ? 'disabled title="Bestäms av placeringen"' : ''}>${S.rooms.map(x => opt(x.id, c.roomId, x.name)).join('')}</select></label>
        </div>
        <div class="loc-row"><span class="small muted">Platser idag:</span>${locRow}</div>
        ${(r.groupRooms || []).length ? '' : `<p class="small">${esc(r.name)} har inga grupprum ännu. <button class="btn ghost" data-gaction="edit-room">Lägg till grupprum</button></p>`}
        <p class="muted small">${avail.length} ${avail.length === 1 ? 'plats' : 'platser'} att fördela grupperna på${totalCap === Infinity ? '' : ` · plats för ${totalCap} grupper`}. Klicka på ett rum för att markera det som upptaget idag; "max" ändrar bara för i dag.</p>
      </section>

      <section class="card">
        <div class="row between"><h2 class="h">Grupper</h2><span class="muted small">${c.groups.length} grupper · ${present.length - pool.length} av ${present.length} elever i grupp</span></div>
        <div class="row wrap gap tools-row">
          <button class="btn" data-gaction="new-group">+ Ny grupp</button>
          ${p ? `<span class="row">Från placeringen:
            <select id="g-size">${[['2', '2 – bänkkompisar'], ['3', 'ca 3'], ['4', 'ca 4'], ['6', 'ca 6'], ['cluster', 'bänkar som står ihop']].map(([v2, t]) => `<option value="${v2}" ${v2 === (openDetails.size || '4') ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <button class="btn" data-gaction="from-placement">Skapa</button></span>` : ''}
          <span class="row">Slumpa grupper om <select id="g-rsize">${[2, 3, 4, 5, 6].map(n => sizeOpt(n, openDetails.rsize || 4)).join('')}</select><button class="btn" data-gaction="random-groups">Slumpa</button></span>
          ${lastEntry ? '<button class="btn" data-gaction="last-groups">Samma grupper som förra gången</button>' : ''}
          ${c.groups.length ? '<button class="btn ghost danger" data-gaction="clear-groups">Töm grupper</button>' : ''}
        </div>
        <p class="hint">Klicka på en grupp för att välja den, och klicka sedan på elever${p ? ' – på kartan eller i listorna –' : ''} för att lägga till eller ta bort dem. Klickar du på en elev utan vald grupp skapas en ny grupp.</p>
        ${p ? `<div class="gmap">${roomGrid(r, { edit: false, seatHTML })}</div>` : ''}
        ${c.groups.length ? `<div class="groups">${cards}</div>` : ''}
        <div class="pool"><b class="small">Inte i någon grupp (${pool.length})</b>
          <div class="chips">${pool.map(s => `<button class="chip" data-gstudent="${s.id}">${esc(s.name)}</button>`).join('') || '<span class="muted small">Alla närvarande elever är i en grupp.</span>'}</div></div>
        <details class="add-box" data-gdetails="flags" ${openDetails.flags ? 'open' : ''}>
          <summary>Frånvarande, vill stanna kvar och löften</summary>
          <div class="flag-block"><b class="small">Frånvarande idag</b><div class="chips">${k.students.map(s => `<button class="chip ${c.absent.includes(s.id) ? 'off' : ''}" data-gabsent="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>
          <div class="flag-block"><b class="small">⌂ Stannar hellre i klassrummet</b> <span class="muted small">– lottas helst inte till grupprum och räknas inte in i rättvisan</span><div class="chips">${k.students.map(s => `<button class="chip ${s.grStay ? 'on' : ''}" data-gstay="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>
          <div class="flag-block"><b class="small">★ Lovad grupprum nästa gång</b> <span class="muted small">– går före i lottningen; försvinner när eleven fått ett grupprum och tillfället sparats</span><div class="chips">${k.students.map(s => `<button class="chip ${s.grPromise ? 'on' : ''}" data-gpromise="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>
        </details>
      </section>

      <section class="card">
        <div class="row wrap gap"><button class="btn primary" data-gaction="lotta" ${active.length ? '' : 'disabled'}>🎲 Lotta rum</button>
          <span class="muted small">Ingen hamnar om möjligt i samma rum som förra gången, och den som suttit på ett ställe färre gånger går före.</span></div>
        ${resultHTML}
      </section>

      <section class="card">
        <h2 class="h">Cirkulationsschema – ${esc(k.name)}</h2>
        ${sched}
      </section>`;

    v.querySelectorAll('details[data-gdetails]').forEach(d => d.addEventListener('toggle', () => { openDetails[d.dataset.gdetails] = d.open; }));
    const gs = $('#g-size', v); if (gs) gs.addEventListener('change', () => { openDetails.size = gs.value; });
    const rs = $('#g-rsize', v); if (rs) rs.addEventListener('change', () => { openDetails.rsize = +rs.value; });
  }

  // ---------- Händelser ----------
  function onClick(e) {
    const { S, save, render, toast, klass, room, ui } = B();
    const t = e.target;
    const c = cur();
    const k = klass(c.classId);
    const done = () => { save(); render(); return true; };
    const stu = id => k.students.find(s => s.id === id);

    const act = t.closest('[data-gaction]');
    if (act) {
      if (act.disabled) return true;
      const a = act.dataset.gaction;
      if (a === 'new-group') { c.active = newGroup(c, []).id; changed(c); return done(); }
      if (a === 'from-placement') {
        if (c.groups.some(g => g.studentIds.length) && !confirm('Ersätta grupperna du har nu?')) return true;
        const v2 = $('#g-size').value;
        fromPlacement(c, v2 === 'cluster' ? 'cluster' : +v2); return done();
      }
      if (a === 'random-groups') {
        if (c.groups.some(g => g.studentIds.length) && !confirm('Ersätta grupperna du har nu?')) return true;
        replaceGroups(c, mergeSingles(chunk(shuffle(presentIds(c)), +$('#g-rsize').value))); return done();
      }
      if (a === 'last-groups') {
        const st = stats(c.classId), h = st.hist[st.hist.length - 1];
        if (c.groups.some(g => g.studentIds.length) && !confirm('Ersätta grupperna du har nu?')) return true;
        const pres = new Set(presentIds(c));
        replaceGroups(c, h.groups.map(g => g.studentIds.filter(id => pres.has(id)))); return done();
      }
      if (a === 'clear-groups') { if (!confirm('Ta bort alla grupper?')) return true; replaceGroups(c, []); return done(); }
      if (a === 'lotta') {
        const err = lotta(c, room(c.roomId));
        if (err) { toast(err); return true; }
        done(); toast('Rummen är lottade!'); return true;
      }
      if (a === 'save') {
        const r = room(c.roomId);
        const locs = locations(c, r);
        const date = ($('#g-date') || {}).value || today();
        const note = (($('#g-note') || {}).value || '').trim();
        const groups = c.groups.filter(g => g.studentIds.length);
        const entry = {
          id: B().uid(), classId: c.classId, roomId: c.roomId, date, note, created: new Date().toISOString(),
          groups: groups.map(g => ({ name: g.name, studentIds: [...g.studentIds], loc: g.loc })),
          locNames: Object.fromEntries(locs.map(l => [l.id, l.name]))
        };
        S.gr.history.push(entry);
        groups.forEach(g => { if (g.loc !== MAIN) g.studentIds.forEach(id => { const s = stu(id); if (s && s.grPromise) delete s.grPromise; }); });
        c.savedId = entry.id;
        done(); toast('Tillfället är sparat i cirkulationsschemat.'); return true;
      }
      if (a === 'edit-room') { ui.roomId = c.roomId; ui.tab = 'klassrum'; render(); return true; }
      return true;
    }

    const loc = t.closest('[data-gloc]');
    if (loc) {
      const id = loc.dataset.gloc;
      c.unavailable = c.unavailable.includes(id) ? c.unavailable.filter(x => x !== id) : [...c.unavailable, id];
      c.groups.forEach(g => { if (g.loc === id && c.unavailable.includes(id)) g.loc = null; });
      changed(c); return done();
    }
    const del = t.closest('[data-gdel]');
    if (del) {
      c.groups = c.groups.filter(g => g.id !== del.dataset.gdel);
      changed(c); return done();
    }
    const hdel = t.closest('[data-ghdel]');
    if (hdel) {
      const h = S.gr.history.find(x => x.id === hdel.dataset.ghdel);
      if (!confirm(`Ta bort tillfället ${fmtDay(h.date)} från schemat?`)) return true;
      S.gr.history = S.gr.history.filter(x => x !== h);
      if (c.savedId === h.id) c.savedId = null;
      return done();
    }
    const sb = t.closest('[data-gstudent]');
    if (sb) { clickStudent(c, sb.dataset.gstudent); return done(); }
    const ab = t.closest('[data-gabsent]');
    if (ab) {
      const id = ab.dataset.gabsent;
      if (c.absent.includes(id)) c.absent = c.absent.filter(x => x !== id);
      else { c.absent.push(id); c.groups.forEach(g => { g.studentIds = g.studentIds.filter(x => x !== id); }); }
      changed(c); return done();
    }
    const sy = t.closest('[data-gstay]');
    if (sy) { const s = stu(sy.dataset.gstay); s.grStay = !s.grStay; if (s.grStay) delete s.grPromise; return done(); }
    const pr = t.closest('[data-gpromise]');
    if (pr) { const s = stu(pr.dataset.gpromise); s.grPromise = !s.grPromise; if (s.grPromise) delete s.grStay; return done(); }
    const card = t.closest('[data-ggroup]');
    if (card) {
      if (t.closest('select, input, label, option')) return true;
      c.active = c.active === card.dataset.ggroup ? null : card.dataset.ggroup;
      return done();
    }
    return false;
  }

  function onChange(e) {
    const { save, render, room, clamp } = B();
    const t = e.target;
    const c = cur();
    if (t.matches('[data-gfield]')) {
      const f = t.dataset.gfield;
      if (f === 'classId') { Object.assign(c, { classId: t.value, sourceId: '', groups: [], absent: [], active: null }); }
      if (f === 'sourceId') {
        c.sourceId = t.value;
        const p = sourcePlacement(c);
        if (p) {
          if (p.roomId !== c.roomId) { c.unavailable = []; c.caps = {}; c.groups.forEach(g => { g.loc = null; }); }
          c.roomId = p.roomId; c.absent = [...p.absent];
        }
      }
      if (f === 'roomId') { c.roomId = t.value; c.unavailable = []; c.caps = {}; c.groups.forEach(g => { g.loc = null; }); }
      changed(c); save(); render(); return true;
    }
    if (t.matches('[data-gcap]')) {
      const n = parseInt(t.value, 10);
      if (n > 0) c.caps[t.dataset.gcap] = clamp(n, 1, 20); else delete c.caps[t.dataset.gcap];
      changed(c); save(); render(); return true;
    }
    if (t.matches('[data-gassign]')) {
      const g = c.groups.find(x => x.id === t.dataset.gassign);
      g.loc = t.value || null;
      changed(c); save(); render(); return true;
    }
    return !!t.closest('[data-gdetails], #g-size, #g-rsize, #g-date, #g-note');
  }

  return { render, onClick, onChange };
})();
