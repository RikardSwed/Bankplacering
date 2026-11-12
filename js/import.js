/* Bänkplacering – import och export av elever
 *
 * TEXTRAD (ett namn per rad, fälten åtskilda med komma, i valfri ordning):
 *   Alva, t, med: Maja; Ella, inte: Hugo, plats: bak, själv
 *   - k / t (kille / tjej)
 *   - med: namn; namn      vill sitta med
 *   - inte: namn; namn     ska inte sitta med
 *   - plats: bak vänster   var i rummet ("plats!:" eller ordet "strikt" = strikt)
 *   - själv / själv!       vill / måste sitta själv
 *
 * TABELL (Excel, CSV eller inklistrat från Excel med tabbar), rubriker:
 *   Namn | Kön | Vill sitta med | Ska inte sitta med | Plats i rummet | Strikt plats | Sitta själv
 */
window.Import = (() => {
  'use strict';

  const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
  const low = s => norm(s).toLowerCase();
  const BOY = ['k', 'kille', 'p', 'pojke', 'm', 'man', 'b', 'boy', 'kil'];
  const GIRL = ['t', 'tjej', 'f', 'flicka', 'kvinna', 'girl', 'tj'];
  const YES = ['ja', 'j', 'x', '1', 'true', 'sant', 'yes', 'y', '✓', '✔'];

  function gender(v) {
    const t = low(v).replace(/[.!]/g, '');
    if (BOY.includes(t)) return 'k';
    if (GIRL.includes(t)) return 't';
    if (['', '-', '–', 'okänt', 'annat', 'x'].includes(t)) return '';
    return null; // förstod inte
  }

  const splitNames = v => String(v ?? '').split(/[;/+]|,(?![^(]*\))/).map(norm).filter(Boolean);

  // ---------- Platser (3 × 3) ----------
  // rad 0 = fram, 1 = mitten, 2 = bak; kolumn 0 = vänster, 1 = mitten, 2 = höger
  const ROW_WORDS = { fram: 0, framme: 0, främst: 0, främre: 0, först: 0, bak: 2, bakom: 2, bakre: 2, bakerst: 2, bakersta: 2, sist: 2, baktill: 2 };
  const COL_WORDS = { vänster: 0, vänstra: 0, v: 0, höger: 2, högra: 2, h: 2 };
  const SKIP = ['längst', 'i', 'till', 'på', 'sidan', 'raden', 'rad', 'del', 'delen', 'av', 'och', 'eller', 'mot', 'ut', 'vid', '-', '–'];

  // Tolkar t.ex. "bak", "bak vänster", "fram mitten", "mittenraden", "höger".
  // Returnerar lista med rutor (0–8) eller null om det inte gick att förstå.
  function parsePosToken(tok) {
    const words = low(tok).replace(/[.,]/g, ' ').split(/[\s-]+/).filter(w => w && !SKIP.includes(w));
    if (!words.length) return [];
    let rows = new Set(), cols = new Set(), mid = 0;
    for (const w of words) {
      if (w in ROW_WORDS) rows.add(ROW_WORDS[w]);
      else if (w in COL_WORDS) cols.add(COL_WORDS[w]);
      else if (['mittenraden', 'mittenrad', 'mittraden', 'mittrad', 'mittenraderna', 'mitten-raden'].includes(w)) rows.add(1);
      else if (['mittenkolumnen', 'mittenkolumn', 'mittkolumnen', 'mittkolumn', 'mittgången', 'mittgång', 'centrum'].includes(w)) cols.add(1);
      else if (['mitten', 'mitt', 'mittersta', 'mittre', 'mellan', 'mellersta'].includes(w)) mid++;
      else if (['alla', 'överallt', 'var', 'som', 'helst'].includes(w)) continue;
      else return null;
    }
    // "mitten" betyder mittenrad om en kolumn är angiven, mittenkolumn om en rad är angiven,
    // och mittenrutan om det står ensamt.
    if (mid) {
      if (rows.size && !cols.size) cols.add(1);
      else if (cols.size && !rows.size) rows.add(1);
      else if (!rows.size && !cols.size) { rows.add(1); cols.add(1); }
      else if (mid >= 1) { /* t.ex. "mitten mitten" – redan täckt */ }
    }
    const R = rows.size ? [...rows] : [0, 1, 2];
    const C = cols.size ? [...cols] : [0, 1, 2];
    const out = [];
    R.forEach(r => C.forEach(c => out.push(r * 3 + c)));
    return out;
  }

  // Hela plats-värdet: flera delar åtskilda med ; / eller komma. "strikt" eller ! gör det strikt.
  function parsePos(value, strictFlag) {
    let v = String(value ?? '');
    let strict = !!strictFlag;
    if (/!\s*$/.test(v) || /\bstrikt\b/i.test(v)) { strict = true; v = v.replace(/!\s*$/, '').replace(/\bstrikt\b/ig, ''); }
    const parts = v.split(/[;/,]/).map(norm).filter(Boolean);
    if (!parts.length) return { pos: null, bad: [] };
    const cells = new Set(), bad = [];
    parts.forEach(pt => { const r = parsePosToken(pt); if (r === null) bad.push(pt); else r.forEach(c => cells.add(c)); });
    return { pos: cells.size ? { cells: [...cells].sort((a, b) => a - b), strict } : null, bad };
  }

  // Skriver rutor som text som går att läsa in igen.
  function posToText(pos) {
    if (!pos || !pos.cells || !pos.cells.length) return '';
    const set = new Set(pos.cells), parts = [], used = new Set();
    const ROWN = ['fram', 'mittenraden', 'bak'], COLN = ['vänster', 'mittenkolumnen', 'höger'];
    [0, 1, 2].forEach(r => { if ([0, 1, 2].every(c => set.has(r * 3 + c))) { parts.push(ROWN[r]); [0, 1, 2].forEach(c => used.add(r * 3 + c)); } });
    [0, 1, 2].forEach(c => { const col = [0, 1, 2].map(r => r * 3 + c); if (col.every(i => set.has(i)) && col.some(i => !used.has(i))) { parts.push(COLN[c]); col.forEach(i => used.add(i)); } });
    pos.cells.forEach(i => {
      if (used.has(i)) return;
      parts.push(i === 4 ? 'mitten' : `${['fram', 'mitten', 'bak'][Math.floor(i / 3)]} ${['vänster', 'mitten', 'höger'][i % 3]}`);
    });
    return parts.join('; ');
  }

  // ---------- Önskemål: namn + allmänna val ----------
  const GIRL_W = ['tjej', 'en tjej', 'någon tjej', 'tjejer', 'flicka', 'en flicka', 'någon flicka'];
  const BOY_W = ['kille', 'en kille', 'någon kille', 'killar', 'pojke', 'en pojke', 'någon pojke'];
  const ALONE_W = ['själv', 'sitta själv', 'ensam'];
  const wishStrictOf = s => !!(s.wishStrict || (s.alone && s.alone.strict));

  // En lista som "Maja; en tjej; själv" definierar elevens hela önskemålslista.
  function applyWishList(e, tokens, strict) {
    const names = [];
    let girl = false, boy = false, alone = false;
    tokens.forEach(t => {
      const w = low(t).replace(/!$/, '');
      if (t.trim().endsWith('!')) strict = true;
      if (GIRL_W.includes(w)) girl = true;
      else if (BOY_W.includes(w)) boy = true;
      else if (ALONE_W.includes(w)) alone = true;
      else if (w === 'strikt') strict = true;
      else names.push(t.replace(/!$/, '').trim());
    });
    e.wishes = names;
    e.wishGirl = girl;
    e.wishBoy = boy;
    if (alone) e.alone = {}; else if (e.alone === undefined) e.alone = null;
    if (strict) e.wishStrict = true; else if (e.wishStrict === undefined) e.wishStrict = false;
  }

  // ---------- Textrader ----------
  const KEYS = [
    { k: 'wishes', re: /^(med|önskar|önskan|önskemål|vill sitta med|vill|kompis|kompisar|sitter med|sitta med)$/ },
    { k: 'avoid', re: /^(inte|inte med|ej|ej med|undvik|undvika|ska inte sitta med|inte sitta med|ej sitta med)$/ },
    { k: 'pos', re: /^(plats|platser|sitter|var|plats i rummet|placering)$/ },
    { k: 'alone', re: /^(själv|sitta själv|ensam)$/ },
    { k: 'gender', re: /^(kön)$/ }
  ];

  function parseLine(line, n) {
    const e = { line: n, raw: line, problems: [] };
    const fields = line.split(',').map(norm);
    // Ett komma inne i en namnlista ("med: Maja, Ella") – slå ihop fält som inte är ett eget nyckelord.
    const merged = [];
    fields.forEach((f, i) => {
      if (i === 0) { merged.push(f); return; }
      const isKey = /^[^:]+!?\s*:/.test(f) && KEYS.some(x => x.re.test(low(f.split(':')[0]).replace(/!$/, '').trim()));
      const isFlag = gender(f) !== null || /^(själv|sitta själv|ensam)!?$/i.test(f) || /^strikt$/i.test(f);
      const prev = merged[merged.length - 1];
      const prevIsList = merged.length > 1 && /^(med|önskar|önskan|önskemål|vill|kompis|kompisar|inte|ej|undvik)[^:]*:/i.test(prev);
      if (!isKey && !isFlag && f && prevIsList) merged[merged.length - 1] = prev + '; ' + f;
      else merged.push(f);
    });
    e.name = merged[0];
    if (!e.name) return null;
    merged.slice(1).forEach(f => {
      if (!f) return;
      const g = gender(f);
      if (g !== null && !f.includes(':')) { e.gender = g; return; }
      const m = f.match(/^([^:]+?)(!?)\s*:\s*(.*)$/);
      if (m) {
        const key = low(m[1]).replace(/!$/, '').trim();
        const strict = m[2] === '!' || /!$/.test(m[1].trim());
        const kind = (KEYS.find(x => x.re.test(key)) || {}).k;
        const val = m[3];
        if (kind === 'wishes') applyWishList(e, splitNames(val), strict);
        else if (kind === 'avoid') e.avoid = splitNames(val);
        else if (kind === 'pos') {
          const r = parsePos(val, strict);
          if (r.bad.length) e.problems.push(`förstod inte platsen "${r.bad.join('; ')}"`);
          e.pos = r.pos;
        } else if (kind === 'alone') {
          const v = low(val);
          if (!v || YES.includes(v)) { e.alone = {}; if (strict) e.wishStrict = true; }
          else if (v === 'strikt' || v.endsWith('!')) { e.alone = {}; e.wishStrict = true; }
          else if (['nej', 'n', '0', 'false', 'no'].includes(v)) e.alone = null;
          else e.problems.push(`förstod inte "${f}"`);
        } else if (kind === 'gender') {
          const g2 = gender(val);
          if (g2 === null) e.problems.push(`förstod inte könet "${val}"`); else e.gender = g2;
        } else e.problems.push(`förstod inte "${f}"`);
        return;
      }
      if (/^(själv|sitta själv|ensam)!?$/i.test(f)) { e.alone = {}; if (f.endsWith('!')) e.wishStrict = true; return; }
      if (/^(en |någon )?(tjej|kille)!?$/i.test(f) && !gender(f)) {
        if (/tjej/i.test(f)) e.wishGirl = true; else e.wishBoy = true;
        if (f.endsWith('!')) e.wishStrict = true;
        return;
      }
      if (/^strikt$/i.test(f)) { if (e.pos) e.pos.strict = true; else if (e.wishes || e.alone || e.wishGirl || e.wishBoy) e.wishStrict = true; else e.problems.push('"strikt" står före det som ska vara strikt – skriv det efter'); return; }
      e.problems.push(`förstod inte "${f}"`);
    });
    return e;
  }

  // ---------- Tabeller (Excel / CSV / inklistrat) ----------
  function headerKind(h) {
    const t = low(h);
    if (!t) return null;
    if (/^(namn|elev|förnamn|name)/.test(t)) return 'name';
    if (/kön|kille|tjej|gender/.test(t)) return 'gender';
    if (/(inte|ej|undvik)/.test(t)) return 'avoid';
    if (/själv|ensam/.test(t)) return 'alone';
    if (/strikt/.test(t) && /(önsk|med|kompis)/.test(t)) return 'wishStrict';
    if (/strikt/.test(t)) return 'posStrict';
    if (/plats|var i|placering|zon/.test(t)) return 'pos';
    if (/(med|önsk|kompis)/.test(t)) return 'wishes';
    return null;
  }
  function looksLikeHeader(row) {
    const kinds = row.map(headerKind);
    return kinds.includes('name') && kinds.filter(Boolean).length >= 2;
  }

  function parseRows(rows) {
    rows = rows.map(r => (r || []).map(c => (c == null ? '' : String(c))));
    while (rows.length && rows[0].every(c => !norm(c))) rows.shift();
    if (!rows.length) return { entries: [], problems: ['Tabellen är tom.'] };
    let map;
    let start = 0;
    if (looksLikeHeader(rows[0])) {
      map = rows[0].map(headerKind);
      start = 1;
    } else {
      // Utan rubriker: Namn, Kön, Vill sitta med, Ska inte sitta med, Plats, Strikt plats, Sitta själv
      map = ['name', 'gender', 'wishes', 'avoid', 'pos', 'posStrict', 'alone'];
    }
    const entries = [];
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      const get = kind => { const j = map.indexOf(kind); return j >= 0 ? row[j] : undefined; };
      const name = norm(get('name'));
      if (!name) continue;
      const e = { line: i + 1, raw: row.join(' | '), problems: [], name };
      const g = get('gender');
      if (g !== undefined && norm(g)) { const gg = gender(g); if (gg === null) e.problems.push(`förstod inte könet "${g}"`); else e.gender = gg; }
      const w = get('wishes'); if (w !== undefined && norm(w)) applyWishList(e, splitNames(w), false);
      const wsx = get('wishStrict');
      if (wsx !== undefined && norm(wsx)) { if (YES.includes(low(wsx)) || low(wsx) === 'strikt') e.wishStrict = true; else if (['nej', 'n', '0', 'false', 'no'].includes(low(wsx))) e.wishStrict = false; }
      const a = get('avoid'); if (a !== undefined && norm(a)) e.avoid = splitNames(a);
      const p = get('pos');
      if (p !== undefined && norm(p)) {
        const ps = YES.includes(low(get('posStrict'))) || low(get('posStrict')) === 'strikt';
        const r = parsePos(p, ps);
        if (r.bad.length) e.problems.push(`förstod inte platsen "${r.bad.join('; ')}"`);
        e.pos = r.pos;
      }
      const al = get('alone');
      if (al !== undefined && norm(al)) {
        const v = low(al);
        if (YES.includes(v)) e.alone = {};
        else if (v === 'strikt' || v.endsWith('!')) { e.alone = {}; e.wishStrict = true; }
        else if (['nej', 'n', '0', 'false', 'no'].includes(v)) e.alone = null;
        else e.problems.push(`förstod inte "sitta själv": "${al}"`);
      }
      entries.push(e);
    }
    return { entries, problems: [] };
  }

  // Text från textrutan: antingen rader med komma, eller en tabell inklistrad från Excel (tabbar).
  function parseText(text) {
    const lines = String(text || '').split(/\r?\n/);
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length && nonEmpty[0].includes('\t')) {
      return parseRows(nonEmpty.map(l => l.split('\t')));
    }
    const entries = [];
    lines.forEach((l, i) => { if (!l.trim() || l.trim().startsWith('#')) return; const e = parseLine(l, i + 1); if (e) entries.push(e); });
    return { entries, problems: [] };
  }

  // ---------- Plan: vad händer med klassen om vi importerar ----------
  function plan(k, entries, uid) {
    const problems = [];
    const byName = new Map();
    k.students.forEach(s => { if (!byName.has(low(s.name))) byName.set(low(s.name), s); });
    const seen = new Map();
    const items = [];
    entries.forEach(e => {
      const key = low(e.name);
      if (seen.has(key)) {
        problems.push(`${e.name} står flera gånger – uppgifterna slås ihop.`);
        const prev = seen.get(key);
        ['gender', 'wishes', 'avoid', 'pos', 'alone', 'wishGirl', 'wishBoy', 'wishStrict'].forEach(f => { if (e[f] !== undefined) prev.entry[f] = e[f]; });
        prev.entry.problems.push(...e.problems);
        return;
      }
      const existing = byName.get(key) || null;
      const target = existing || { id: uid(), name: e.name, gender: '', wishes: [], avoid: [] };
      const it = { entry: e, existing, student: target, isNew: !existing };
      items.push(it); seen.set(key, it);
      if (!existing) byName.set(key, target);
    });
    const max = k.maxWishes ?? 3;
    items.forEach(it => {
      const e = it.entry;
      const resolve = (names, what) => {
        const ids = [];
        names.forEach(nm => {
          const s = byName.get(low(nm));
          if (!s) e.problems.push(`hittade ingen elev som heter "${nm}" (${what})`);
          else if (s === it.student) e.problems.push(`kan inte ${what === 'önskemål' ? 'önska' : 'undvika'} sig själv`);
          else if (!ids.includes(s.id)) ids.push(s.id);
        });
        return ids;
      };
      it.wishIds = e.wishes !== undefined ? resolve(e.wishes, 'önskemål') : undefined;
      it.avoidIds = e.avoid !== undefined ? resolve(e.avoid, 'ska inte sitta med') : undefined;
      if (it.wishIds && it.wishIds.length > max) {
        e.problems.push(`önskar ${it.wishIds.length} personer men klassen tillåter ${max} – bara de ${max} första tas med (ändra "Max antal önskemål" om du vill ha fler)`);
        it.wishIds = it.wishIds.slice(0, max);
      }
    });
    return { items, problems };
  }

  function apply(k, p) {
    p.items.forEach(it => {
      const s = it.student, e = it.entry;
      if (it.isNew) k.students.push(s);
      if (e.gender !== undefined) s.gender = e.gender;
      if (it.wishIds !== undefined) s.wishes = it.wishIds;
      if (it.avoidIds !== undefined) s.avoid = it.avoidIds;
      if (e.pos !== undefined) { if (e.pos) s.pos = e.pos; else delete s.pos; }
      if (e.alone !== undefined) { if (e.alone) s.alone = {}; else delete s.alone; }
      if (e.wishGirl !== undefined) { if (e.wishGirl) s.wishGirl = true; else delete s.wishGirl; }
      if (e.wishBoy !== undefined) { if (e.wishBoy) s.wishBoy = true; else delete s.wishBoy; }
      if (e.wishStrict !== undefined) { if (e.wishStrict) s.wishStrict = true; else delete s.wishStrict; }
      if (s.alone && s.alone.strict) { s.wishStrict = true; s.alone = {}; }
      if (!((s.wishes || []).length || s.alone || s.wishGirl || s.wishBoy)) delete s.wishStrict;
    });
  }

  // ---------- Export ----------
  function toLine(s, nameOf) {
    const parts = [s.name];
    if (s.gender) parts.push(s.gender);
    const list = (s.wishes || []).map(nameOf).filter(Boolean)
      .concat(s.wishGirl ? ['en tjej'] : [], s.wishBoy ? ['en kille'] : []);
    const strict = wishStrictOf(s);
    if (!list.length && s.alone) parts.push(strict ? 'själv!' : 'själv');
    else if (list.length) parts.push(`med${strict ? '!' : ''}: ` + list.concat(s.alone ? ['själv'] : []).join('; '));
    if ((s.avoid || []).length) parts.push('inte: ' + s.avoid.map(nameOf).filter(Boolean).join('; '));
    if (s.pos && s.pos.cells && s.pos.cells.length) parts.push(`plats${s.pos.strict ? '!' : ''}: ${posToText(s.pos)}`);
    return parts.join(', ');
  }
  const HEAD = ['Namn', 'Kön', 'Vill sitta med', 'Sitta själv', 'Strikt önskemål', 'Ska inte sitta med', 'Plats i rummet', 'Strikt plats'];
  function toRows(students, nameOf) {
    return [HEAD].concat(students.map(s => [
      s.name,
      s.gender || '',
      (s.wishes || []).map(nameOf).filter(Boolean).concat(s.wishGirl ? ['en tjej'] : [], s.wishBoy ? ['en kille'] : []).join('; '),
      s.alone ? 'ja' : '',
      wishStrictOf(s) ? 'ja' : '',
      (s.avoid || []).map(nameOf).filter(Boolean).join('; '),
      posToText(s.pos),
      s.pos && s.pos.strict ? 'ja' : ''
    ]));
  }
  const EXAMPLE_ROWS = [
    HEAD,
    ['Alva', 't', 'Maja; Ella', '', '', '', 'bak', ''],
    ['Elias', 'k', 'Hugo', '', '', 'Liam', '', ''],
    ['Maja', 't', 'Alva; en tjej', '', '', '', '', ''],
    ['Hugo', 'k', '', '', '', '', 'fram vänster', 'ja'],
    ['Ella', 't', '', 'ja', '', '', '', ''],
    ['Liam', 'k', 'Elias', 'ja', 'ja', '', '', '']
  ];

  return { parseText, parseRows, plan, apply, toLine, toRows, posToText, parsePos, EXAMPLE_ROWS, HEAD };
})();
