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

  // =====================================================================
  // Namn: normalisering och matchning
  // =====================================================================
  // Stora/små bokstäver, extra mellanslag, punkter och accenter (utom å, ä, ö) spelar ingen roll.
  const ACC = { é: 'e', è: 'e', ê: 'e', ë: 'e', á: 'a', à: 'a', â: 'a', ã: 'a', í: 'i', ì: 'i', î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', õ: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y', ç: 'c', ñ: 'n', ø: 'ö', æ: 'ä' };
  function nameKey(s) {
    return String(s ?? '').toLowerCase().normalize('NFC')
      .replace(/[éèêëáàâãíìîïóòôõúùûüýÿçñøæ]/g, c => ACC[c] || c)
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  const firstWord = s => nameKey(s).split(' ')[0] || '';

  // Klass: "7c", "7C", "7 c", "Klass 7C" och "7c " blir samma sak.
  function classKey(s) {
    const t = nameKey(s).replace(/\bklass(en)?\b/g, ' ').trim();
    const m = t.match(/(\d+)\s*([\p{L}]{1,3})?\b/u);
    if (m) return m[1] + (m[2] || '');
    return t.replace(/[\s-]/g, '');
  }

  // Damerau–Levenshtein (begränsad) – hur många bokstäver som skiljer.
  function dist(a, b) {
    const n = a.length, m = b.length;
    if (Math.abs(n - m) > 3) return 9;
    const d = Array.from({ length: n + 1 }, (_, i) => [i].concat(new Array(m).fill(0)));
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[n][m];
  }

  // Bygger en matchare för en klass. aliases: { nameKey: studentId } – sådant läraren lärt appen.
  function matcher(students, aliases = {}) {
    const byKey = new Map(), byFirst = new Map();
    students.forEach(s => {
      const k = nameKey(s.name), f = firstWord(s.name);
      if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(s);
      if (!byFirst.has(f)) byFirst.set(f, []); byFirst.get(f).push(s);
    });
    const exists = id => students.some(s => s.id === id);

    function one(token) {
      const key = nameKey(token);
      if (!key) return { ids: [] };
      if (aliases[key] && exists(aliases[key])) return { ids: [aliases[key]], how: 'alias' };
      const ex = byKey.get(key);
      if (ex && ex.length === 1) return { ids: [ex[0].id], how: 'exakt' };
      if (ex && ex.length > 1) return { ids: [], candidates: ex.map(s => ({ id: s.id, why: 'samma namn' })) };
      const words = key.split(' ');
      // "maja" när eleven heter "Maja Andersson" – bara om det är entydigt.
      if (words.length === 1) {
        const f = byFirst.get(key);
        if (f && f.length === 1) return { ids: [f[0].id], how: 'förnamn' };
        if (f && f.length > 1) return { ids: [], candidates: f.map(s => ({ id: s.id, why: 'samma förnamn' })) };
      } else {
        // "maja andersson" när eleven bara heter "Maja" (eller "Maja A")
        const pre = students.filter(s => { const sk = nameKey(s.name); return key.startsWith(sk + ' ') || sk.startsWith(key + ' ') || (firstWord(sk) === words[0] && sk.split(' ').length > 1 && sk.split(' ')[1][0] === (words[1] || '')[0]); });
        if (pre.length === 1) return { ids: [pre[0].id], how: 'förnamn' };
        const f = byFirst.get(words[0]) || [];
        if (f.length === 1 && students.every(s => nameKey(s.name).split(' ').length === 1 || s === f[0])) return { ids: [f[0].id], how: 'förnamn' };
      }
      return null;
    }

    function match(token) {
      const key = nameKey(token);
      const words = key.split(' ');
      // Flera namn utan skiljetecken: "maja ella" – om varje ord är ett eget elevnamn
      if (words.length > 1 && !byKey.has(key)) {
        const parts = words.map(w => (byKey.get(w) || []).length === 1 ? byKey.get(w)[0].id : null);
        if (parts.every(Boolean) && new Set(parts).size === words.length) return { ids: parts, how: 'flera' };
      }
      const direct = one(token);
      if (direct && (direct.ids.length || direct.candidates)) return direct.ids.length ? direct : { ids: [], candidates: direct.candidates };
      if (words.length > 1) {
        const parts = words.map(w => one(w));
        if (parts.every(p => p && p.ids.length === 1)) {
          const ids = [...new Set(parts.map(p => p.ids[0]))];
          if (ids.length === words.length) return { ids, how: 'flera' };
        }
      }
      // Förslag: stavfel och möjliga smeknamn – används aldrig automatiskt.
      const cands = [];
      students.forEach(s => {
        const sk = nameKey(s.name), f = firstWord(s.name);
        const d = Math.min(dist(key, sk), dist(key, f));
        const lim = key.length <= 4 ? 1 : key.length <= 7 ? 2 : 3;
        if (d <= lim) { cands.push({ id: s.id, why: 'liknande stavning', score: d }); return; }
        if (key.length >= 2 && f.length >= 2 && key.slice(0, 2) === f.slice(0, 2) && (key.length <= 6 || f.startsWith(key.slice(0, 3)))) {
          cands.push({ id: s.id, why: 'smeknamn?', score: 3 + dist(key, f) / 10 });
        }
      });
      cands.sort((a, b) => a.score - b.score);
      return { ids: [], candidates: cands.slice(0, 5) };
    }
    return { match, one };
  }

  // =====================================================================
  // Önskemål i fritext (från formulär) och listor
  // =====================================================================
  const GIRL_W = ['tjej', 'en tjej', 'någon tjej', 'tjejer', 'flicka', 'en flicka', 'någon flicka', 'en tjej vem som helst'];
  const BOY_W = ['kille', 'en kille', 'någon kille', 'killar', 'pojke', 'en pojke', 'någon pojke', 'en kille vem som helst'];
  const ALONE_W = ['själv', 'sitta själv', 'ensam', 'vill sitta själv', 'jag vill sitta själv', 'sitter helst själv', 'helst själv'];
  const IGNORE_W = ['', '-', '–', '?', 'x', 'nej', 'ingen', 'inga', 'ingen speciell', 'vet ej', 'vet inte', 'ingen aning', 'spelar ingen roll',
    'vem som helst', 'alla', 'vilken som helst', 'det spelar ingen roll', 'kvittar', 'inget', 'ingenting', 'har ingen', 'ingen särskild', 'n/a'];
  const FILLER = /^(jag vill (gärna )?sitta (bredvid|med)|vill (gärna )?sitta (bredvid|med)|sitta (bredvid|med)|jag vill|bredvid|med|gärna|helst|kanske|typ|antingen)\s+/i;
  const wishStrictOf = s => !!(s.wishStrict || (s.alone && s.alone.strict));

  // Delar "Maja och Ella", "Maja, Ella eller Hugo", "1. Maja 2. Ella", "Maja > Ella" i delar.
  function splitFree(text) {
    let t = String(text ?? '').replace(/\r?\n/g, ';').replace(/\([^)]*\)/g, ' ');
    let ranked = false;
    if (t.includes('>')) { ranked = true; t = t.replace(/>/g, ';'); }
    if (/(^|[\s;,])\d\s*[.):]\s*\S/.test(t)) { ranked = true; t = t.replace(/(^|[\s;,])\d\s*[.):]\s*/g, ';'); }
    const parts = t.split(/[;,/+&]|\s+(?:och|eller|samt|alternativt|alt\.?)\s+/i)
      .map(p => { let q = norm(p).replace(/[.!?]+$/, '').trim(); let prev; do { prev = q; q = q.replace(FILLER, ''); } while (q !== prev); return q; })
      .filter(Boolean);
    return { tokens: parts, ranked };
  }

  // En lista som "Maja; en tjej; själv" definierar elevens hela önskemålslista.
  function applyWishList(e, tokens, strict, ranked) {
    const names = [];
    let girl = false, boy = false, alone = false;
    tokens.forEach(t => {
      const w = low(t).replace(/!$/, '');
      if (t.trim().endsWith('!')) strict = true;
      if (GIRL_W.includes(w)) girl = true;
      else if (BOY_W.includes(w)) boy = true;
      else if (ALONE_W.includes(w)) alone = true;
      else if (w === 'strikt') strict = true;
      else if (IGNORE_W.includes(w)) { /* inget önskemål */ }
      else names.push(t.replace(/!$/, '').trim());
    });
    e.wishes = names;
    e.wishGirl = girl;
    e.wishBoy = boy;
    if (alone) e.alone = {}; else if (e.alone === undefined) e.alone = null;
    if (strict) e.wishStrict = true; else if (e.wishStrict === undefined) e.wishStrict = false;
    if (ranked) e.wishRanked = true; else if (e.wishRanked === undefined) e.wishRanked = false;
  }
  function avoidList(text) {
    return splitFree(text).tokens.filter(t => !IGNORE_W.includes(low(t)));
  }

  // =====================================================================
  // Textrader
  // =====================================================================
  const KEYS = [
    { k: 'wishes', re: /^(med|önskar|önskan|önskemål|vill sitta med|vill|kompis|kompisar|sitter med|sitta med)$/ },
    { k: 'avoid', re: /^(inte|inte med|ej|ej med|undvik|undvika|ska inte sitta med|inte sitta med|ej sitta med)$/ },
    { k: 'pos', re: /^(plats|platser|sitter|var|plats i rummet|placering)$/ },
    { k: 'alone', re: /^(själv|sitta själv|ensam)$/ },
    { k: 'gender', re: /^(kön)$/ },
    { k: 'klass', re: /^(klass)$/ }
  ];

  function parseLine(line, n) {
    const e = { line: n, raw: line, problems: [] };
    const fields = line.split(',').map(norm);
    // Ett komma inne i en namnlista ("med: Maja, Ella") – slå ihop fält som inte är ett eget nyckelord.
    const merged = [];
    fields.forEach((f, i) => {
      if (i === 0) { merged.push(f); return; }
      const isKey = /^[^:]+!?\s*:/.test(f) && KEYS.some(x => x.re.test(low(f.split(':')[0]).replace(/!$/, '').trim()));
      const isFlag = gender(f) !== null || /^(själv|sitta själv|ensam)!?$/i.test(f) || /^strikt$/i.test(f) || /^(en |någon )(tjej|kille)!?$/i.test(f);
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
        if (kind === 'wishes') { const sp = splitFree(val); applyWishList(e, sp.tokens, strict, sp.ranked); }
        else if (kind === 'avoid') e.avoid = avoidList(val);
        else if (kind === 'klass') e.klass = norm(val);
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

  // =====================================================================
  // Tabeller (Excel, CSV, Google Formulär, inklistrat)
  // =====================================================================
  const KIND_LABELS = {
    ignore: '– använd inte –', name: 'Namn', klass: 'Klass', gender: 'Kön', wishes: 'Önskemål (fritext)',
    alone: 'Sitta själv', wishStrict: 'Strikt önskemål', avoid: 'Ska inte sitta med', pos: 'Plats i rummet', posStrict: 'Strikt plats'
  };
  function headerKind(h) {
    const t = low(h);
    if (!t) return 'ignore';
    if (/tidst|tidpunkt|timestamp|e-?post|email|mejl|poäng|score/.test(t)) return 'ignore';
    if (/(förnamn|efternamn|^namn|vad heter|ditt namn|ditt för|elev(ens)? ?namn|^elev$|^name)/.test(t)) return 'name';
    if (/klass|class/.test(t)) return 'klass';
    if (/kön|kille eller tjej|tjej eller kille|gender/.test(t)) return 'gender';
    if (/(inte|ej|undvik|inte vill)/.test(t)) return 'avoid';
    if (/själv|ensam/.test(t)) return 'alone';
    if (/strikt/.test(t) && /(önsk|med|kompis)/.test(t)) return 'wishStrict';
    if (/strikt/.test(t)) return 'posStrict';
    if (/plats|var i|placering|zon|var vill du sitta/.test(t)) return 'pos';
    if (/(med|önsk|kompis|bredvid|vem vill)/.test(t)) return 'wishes';
    return 'ignore';
  }
  // ---------- Vilken sorts kolumn? Gissning utifrån innehållet (när rubrikrad saknas) ----------
  const CLASS_RE = /^\s*(klass\s*)?\d{1,2}\s*[a-zåäö]{0,3}\s*$/i;
  const TIME_RE = /^\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T]\d{1,2}[:.]\d{2}.*)?\s*$|^\s*\d{1,2}[:.]\d{2}([:.]\d{2})?\s*$/;
  function contentKind(values) {
    const v = values.map(x => norm(x)).filter(Boolean);
    if (!v.length) return { kind: 'ignore', conf: 1 };
    const share = f => v.filter(f).length / v.length;
    if (share(x => TIME_RE.test(x)) > 0.6) return { kind: 'ignore', conf: 1 };
    if (share(x => x.includes('@')) > 0.6) return { kind: 'ignore', conf: 1 };
    if (share(x => CLASS_RE.test(x)) > 0.6) return { kind: 'klass', conf: 1 };
    if (share(x => gender(x) !== null && x.length <= 6) > 0.7) return { kind: 'gender', conf: 1 };
    const words = x => x.split(/\s+/).length;
    const nameLike = x => words(x) <= 3 && x.length <= 30 && /^[\p{L}][\p{L}\s.'-]*$/u.test(x) && !/\b(och|eller|inte|vill|med|bak|fram|ingen|vet)\b/i.test(x);
    if (share(nameLike) > 0.75) return { kind: 'name', conf: share(nameLike) };
    return { kind: 'wishes', conf: 0.6 };
  }
  function looksLikeData(row) { return row.some(c => CLASS_RE.test(norm(c)) || TIME_RE.test(norm(c))); }

  function guessMapping(rows) {
    const first = (rows[0] || []).map(c => norm(c));
    const kinds = first.map(headerKind);
    const known = kinds.filter(k => k !== 'ignore').length;
    const hasHeader = !looksLikeData(first) && (kinds.includes('name') || known >= 2);
    const ncols = Math.max(...rows.map(r => (r || []).length), first.length);
    if (hasHeader) return { hasHeader: true, mapping: kinds.concat(new Array(Math.max(0, ncols - kinds.length)).fill('ignore')), headers: first, guessed: 'header' };
    // Utan rubriker: titta på innehållet i varje kolumn.
    const mapping = [];
    for (let j = 0; j < ncols; j++) mapping.push(contentKind(rows.map(r => (r || [])[j])).kind);
    // Bara en namnkolumn – den första; fler "namnlika" kolumner är troligen önskemål med ett namn i.
    let seenName = false;
    mapping.forEach((k, j) => { if (k === 'name') { if (seenName) mapping[j] = 'wishes'; seenName = true; } });
    if (!seenName) { const j = mapping.findIndex(k => k === 'wishes'); if (j >= 0) mapping[j] = 'name'; }
    return { hasHeader: false, mapping, headers: mapping.map((_, i) => `Kolumn ${i + 1}`), guessed: 'content' };
  }

  // ---------- Fritext: dela upp i vill sitta med / inte sitta med / plats ----------
  const NEG_RE = /\b(inte|ej|icke|undvik\w*|absolut inte|helst inte|aldrig)\b/i;
  const POS_PHRASES = [
    [/\b(längst fram|längre fram|framme|framtill|nära tavlan|vid tavlan|främre raden|första raden|främst|fram)\b/gi, 'fram'],
    [/\b(längst bak|längre bak|bakerst|baktill|bakre raden|sista raden|där bak|bak)\b/gi, 'bak'],
    [/\b(i mitten|mittenraden|mitten)\b/gi, 'mitten'],
    [/\b(till vänster|vänstra|vänster)\b/gi, 'vänster'],
    [/\b(till höger|högra|höger)\b/gi, 'höger']
  ];
  // Platser som inte går att översätta till rutnätet – sparas för läraren att titta på.
  const UNMAPPED_RE = /\b(vid|nära|bredvid|intill|mot|långt från|en bit från)\s+(fönstr\w*|fönster|dörr\w*|vägg\w*|element\w*|kateder\w*|katedern|lärar\w*|whiteboard\w*|skåp\w*|gång\w*|hörn\w*)\b/gi;
  const FILL_WORDS = /\b(jag|vill|gärna|helst|sitta|sitter|vara|med|bredvid|nära|kanske|typ|också|och|eller|om|det|går|i|på|till|längst|där|lite|plats(en)?|rad(en)?|klassrummet|salen|rummet|bara|kan|skulle|vilja)\b/gi;

  function classifyFree(text) {
    const out = { wish: [], avoid: [], posWords: [], leftovers: [], ranked: false };
    let t = String(text ?? '').replace(/\r?\n/g, '. ');
    if (IGNORE_W.includes(low(t).replace(/[.!?]+$/, ''))) return out;
    // Numrerade önskemål ("1. Maja 2. Ella") = prioritetsordning
    if (/(^|[\s;,])\d\s*[.):]\s*\S/.test(t)) { out.ranked = true; t = t.replace(/(^|[\s;,])\d\s*[.):]\s*/g, '; '); }
    t = t.replace(UNMAPPED_RE, m => { out.leftovers.push(m.trim()); return ' '; });
    const clauses = t.split(/[.!?]+|\s+men\s+|\s+fast\s+/i).map(x => x.trim()).filter(Boolean);
    clauses.forEach(cl => {
      if (IGNORE_W.includes(low(cl))) return;
      // platsord ut ur satsen
      let rest = cl;
      POS_PHRASES.forEach(([re, word]) => { rest = rest.replace(re, () => { out.posWords.push(word); return ' '; }); });
      const neg = rest.search(NEG_RE);
      const take = (part, list) => {
        const sp = splitFree(part);
        if (sp.ranked) out.ranked = true;
        sp.tokens.forEach(tok => {
          const clean = norm(tok.replace(NEG_RE, ' ').replace(FILL_WORDS, ' '));
          if (!clean) return;
          if (IGNORE_W.includes(low(clean))) return;
          list.push(clean);
        });
      };
      if (neg >= 0) { take(rest.slice(0, neg), out.wish); take(rest.slice(neg), out.avoid); }
      else take(rest, out.wish);
    });
    return out;
  }

  function entriesFromTable(rows, mapping, hasHeader, opts = {}) {
    rows = rows.map(r => (r || []).map(c => (c == null ? '' : String(c))));
    const entries = [];
    const idx = kind => mapping.map((k, i) => (k === kind ? i : -1)).filter(i => i >= 0);
    const nameCols = idx('name'), wishCols = idx('wishes');
    const answerCols = mapping.map((k, i) => (['wishes', 'avoid', 'pos', 'alone'].includes(k) ? i : -1)).filter(i => i >= 0);
    for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
      const row = rows[i];
      const get = kind => { const j = mapping.indexOf(kind); return j >= 0 ? row[j] : undefined; };
      const name = norm(nameCols.map(j => row[j]).filter(x => norm(x)).join(' '));
      if (!name) continue;
      const e = { line: i + 1, raw: row.join(' | '), problems: [], name, notes: [] };
      // Elevens egen text sparas, så att läraren kan jämföra med hur appen tolkat den.
      const answer = answerCols.map(j => norm(row[j])).filter(Boolean).join(' · ');
      if (answer) e.answer = answer;
      const kl = get('klass'); if (kl !== undefined && norm(kl)) e.klass = norm(kl);
      const g = get('gender');
      if (g !== undefined && norm(g)) { const gg = gender(g); if (gg === null) e.problems.push(`förstod inte könet "${g}"`); else e.gender = gg; }
      let freeAvoid = [], freePos = [];
      if (wishCols.length) {
        const texts = wishCols.map(j => row[j]).filter(x => norm(x));
        if (texts.length) {
          const toks = [];
          let ranked = wishCols.length > 1 && !!opts.multiRanked;
          texts.forEach(tx => {
            const c = classifyFree(tx);
            toks.push(...c.wish); freeAvoid.push(...c.avoid); freePos.push(...c.posWords);
            if (c.ranked) ranked = true;
            c.leftovers.forEach(l => e.notes.push(`"${l}" går inte att översätta till en plats`));
          });
          applyWishList(e, toks, false, ranked || !!opts.ranked);
        } else applyWishList(e, [], false, false);
      }
      const wsx = get('wishStrict');
      if (wsx !== undefined && norm(wsx)) { if (YES.includes(low(wsx)) || low(wsx) === 'strikt') e.wishStrict = true; else if (['nej', 'n', '0', 'false', 'no'].includes(low(wsx))) e.wishStrict = false; }
      const a = get('avoid');
      if (a !== undefined && norm(a)) e.avoid = avoidList(a).concat(freeAvoid);
      else if (freeAvoid.length || wishCols.length) e.avoid = freeAvoid;
      const p = get('pos');
      if (p !== undefined && norm(p)) {
        const ps = YES.includes(low(get('posStrict'))) || low(get('posStrict')) === 'strikt';
        const c = classifyFree(p);
        const words = c.posWords.length ? c.posWords.join(' ') : p;
        const r = parsePos(words, ps);
        if (r.bad.length && !c.posWords.length) e.problems.push(`förstod inte platsen "${r.bad.join('; ')}"`);
        c.leftovers.forEach(l => e.notes.push(`"${l}" går inte att översätta till en plats`));
        e.pos = r.pos;
      } else if (freePos.length) {
        const r = parsePos(freePos.join(' '), false);
        e.pos = r.pos;
      } else if (wishCols.length) e.pos = null;
      const al = get('alone');
      if (al !== undefined && norm(al)) {
        const v = low(al);
        if (YES.includes(v)) e.alone = {};
        else if (v === 'strikt' || v.endsWith('!')) { e.alone = {}; e.wishStrict = true; }
        else if (['nej', 'n', '0', 'false', 'no'].includes(v)) e.alone = null;
        else e.problems.push(`förstod inte "sitta själv": "${al}"`);
      }
      if (opts.ranked && e.wishes && e.wishes.length) e.wishRanked = true;
      // Långa "namn" är troligen meningar appen inte förstått – flagga för granskning.
      const longTok = (e.wishes || []).concat(e.avoid || []).filter(x => x.split(/\s+/).length >= 3);
      longTok.forEach(x => e.notes.push(`"${x}" ser inte ut som ett namn`));
      e.uncertain = e.notes.length > 0;
      entries.push(e);
    }
    return entries;
  }

  // Text från textrutan: rader med komma – eller en tabell inklistrad från Excel/Google (tabbar).
  function parseText(text) {
    const lines = String(text || '').split(/\r?\n/);
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length && nonEmpty[0].includes('\t')) return { table: nonEmpty.map(l => l.split('\t')) };
    const entries = [];
    lines.forEach((l, i) => { if (!l.trim() || l.trim().startsWith('#')) return; const e = parseLine(l, i + 1); if (e) entries.push(e); });
    return { entries };
  }

  // Gruppera rader efter klass ("7c" och "7C" är samma).
  function groupByClass(entries) {
    const groups = new Map();
    entries.forEach(e => {
      const key = e.klass ? classKey(e.klass) : '';
      if (!groups.has(key)) groups.set(key, { key, labels: {}, entries: [] });
      const g = groups.get(key);
      g.entries.push(e);
      if (e.klass) g.labels[e.klass] = (g.labels[e.klass] || 0) + 1;
    });
    groups.forEach(g => {
      const best = Object.entries(g.labels).sort((a, b) => b[1] - a[1])[0];
      g.label = best ? best[0].toUpperCase() : '';
    });
    return [...groups.values()];
  }

  // =====================================================================
  // Plan: vad händer med klassen om vi importerar
  // resolutions: { nyckel: elevId | 'skip' | 'new' } – lärarens val i "Att reda ut"
  // =====================================================================
  const resKey = (who, kind, token) => `${nameKey(who)}|${kind}|${nameKey(token)}`;

  function plan(k, entries, uid, resolutions = {}) {
    const problems = [];
    const aliases = k.aliases || {};
    const existing = matcher(k.students, aliases);
    const seen = new Map();
    const items = [];
    const similar = [];
    entries.forEach(e => {
      const key = nameKey(e.name);
      if (seen.has(key)) {
        problems.push(`${e.name} står flera gånger – uppgifterna slås ihop.`);
        const prev = seen.get(key);
        ['gender', 'wishes', 'avoid', 'pos', 'alone', 'wishGirl', 'wishBoy', 'wishStrict', 'wishRanked'].forEach(f => { if (e[f] !== undefined) prev.entry[f] = e[f]; });
        prev.entry.problems.push(...e.problems);
        return;
      }
      // Finns eleven redan? Exakt, sparat smeknamn eller entydigt förnamn räknas som samma elev.
      let target = null;
      const self = existing.one(e.name);
      const selfRes = resolutions['self|' + key];
      if (selfRes && selfRes !== 'new') target = k.students.find(s => s.id === selfRes) || null;
      else if (!selfRes && self && self.ids.length === 1) target = k.students.find(s => s.id === self.ids[0]);
      if (!target && selfRes !== 'new') {
        const m = existing.match(e.name);
        const cands = (m.candidates || []).filter(c => !items.some(it => it.student.id === c.id));
        if (cands.length) similar.push({ key: 'self|' + key, name: e.name, candidates: cands });
      }
      if (target && items.some(it => it.student === target)) target = null; // redan använd av en annan rad
      const student = target || { id: uid(key), name: e.name, gender: '', wishes: [], avoid: [] };
      const it = { entry: e, existing: target, student, isNew: !target };
      items.push(it); seen.set(key, it);
    });
    // Alla elever (befintliga + nya) som namn i önskemål kan matcha mot
    const all = k.students.slice();
    items.forEach(it => { if (it.isNew) all.push(it.student); });
    const M = matcher(all, aliases);
    const unresolved = [];
    const max = k.maxWishes ?? 3;
    items.forEach(it => {
      const e = it.entry;
      const resolve = (names, kind) => {
        const ids = [];
        names.forEach((nm, rank) => {
          const rk = resKey(e.origName || e.name, kind, nm);
          const r = resolutions[rk];
          let got = [];
          if (r === 'skip') return;
          if (r && r !== 'add') got = [r];
          else {
            const m = M.match(nm);
            if (m.ids.length) got = m.ids;
            else { unresolved.push({ key: rk, who: e.name, whoItem: it, kind, token: nm, rank, candidates: (m.candidates || []).filter(c => c.id !== it.student.id) }); return; }
          }
          got.forEach(id => { if (id !== it.student.id && !ids.includes(id)) ids.push(id); });
        });
        return ids;
      };
      it.wishIds = e.wishes !== undefined ? resolve(e.wishes, 'wish') : undefined;
      it.avoidIds = e.avoid !== undefined ? resolve(e.avoid, 'avoid') : undefined;
      if (it.wishIds && it.wishIds.length > max) {
        e.problems.push(`önskar ${it.wishIds.length} personer men klassen tillåter ${max} – bara de ${max} första tas med (ändra "Max antal önskemål" om du vill ha fler)`);
        it.wishIds = it.wishIds.slice(0, max);
      }
    });
    return { items, problems, unresolved, similar };
  }

  // remember: spara lärarens val som smeknamn/stavning för framtida importer
  function apply(k, p, resolutions = {}, remember = true) {
    k.aliases = k.aliases || {};
    k.unresolved = k.unresolved || [];
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
      if (e.wishRanked !== undefined) { if (e.wishRanked) s.wishRanked = true; else delete s.wishRanked; }
      if (s.alone && s.alone.strict) { s.wishStrict = true; s.alone = {}; }
      if (!((s.wishes || []).length || s.alone || s.wishGirl || s.wishBoy)) delete s.wishStrict;
      if (!(s.wishes || []).length) delete s.wishRanked;
      // Elevens egen text från formuläret, och om läraren vill granska eleven senare
      if (e.answer) s.answer = { text: e.answer, date: new Date().toISOString().slice(0, 10) };
      if (it.review) s.review = true;
      // Det som inte gick att reda ut nu sparas i klassens lista "Att reda ut".
      if (it.wishIds !== undefined) k.unresolved = k.unresolved.filter(u => !(u.from === s.id && u.kind === 'wish'));
      if (it.avoidIds !== undefined) k.unresolved = k.unresolved.filter(u => !(u.from === s.id && u.kind === 'avoid'));
    });
    p.unresolved.forEach(u => {
      k.unresolved.push({ id: Math.random().toString(36).slice(2, 10), from: u.whoItem.student.id, kind: u.kind, token: u.token, rank: u.rank, candidates: u.candidates.map(c => c.id) });
    });
    if (remember) {
      Object.entries(resolutions).forEach(([key, val]) => {
        if (!val || val === 'skip' || val === 'new') return;
        const token = key.split('|').slice(2).join('|') || (key.startsWith('self|') ? key.slice(5) : '');
        if (key.startsWith('self|')) { const tk = key.slice(5); const st = k.students.find(s => s.id === val); if (st && nameKey(st.name) !== tk) k.aliases[tk] = val; return; }
        const st = k.students.find(s => s.id === val);
        if (st && token && nameKey(st.name) !== token) k.aliases[token] = val;
      });
    }
  }

  // =====================================================================
  // Export
  // =====================================================================
  function wishListText(s, nameOf) {
    return (s.wishes || []).map(nameOf).filter(Boolean).concat(s.wishGirl ? ['en tjej'] : [], s.wishBoy ? ['en kille'] : []);
  }
  function toLine(s, nameOf) {
    const parts = [s.name];
    if (s.gender) parts.push(s.gender);
    const list = wishListText(s, nameOf);
    const strict = wishStrictOf(s);
    const sep = s.wishRanked && (s.wishes || []).length > 1 ? ' > ' : '; ';
    if (!list.length && s.alone) parts.push(strict ? 'själv!' : 'själv');
    else if (list.length) parts.push(`med${strict ? '!' : ''}: ` + list.concat(s.alone ? ['själv'] : []).join(sep));
    if ((s.avoid || []).length) parts.push('inte: ' + s.avoid.map(nameOf).filter(Boolean).join('; '));
    if (s.pos && s.pos.cells && s.pos.cells.length) parts.push(`plats${s.pos.strict ? '!' : ''}: ${posToText(s.pos)}`);
    return parts.join(', ');
  }
  const HEAD = ['Namn', 'Kön', 'Vill sitta med', 'Sitta själv', 'Strikt önskemål', 'Ska inte sitta med', 'Plats i rummet', 'Strikt plats'];
  function toRows(students, nameOf) {
    return [HEAD].concat(students.map(s => [
      s.name,
      s.gender || '',
      wishListText(s, nameOf).join(s.wishRanked && (s.wishes || []).length > 1 ? ' > ' : '; '),
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
    ['Maja', 't', 'Alva > Ella', '', '', '', '', ''],
    ['Hugo', 'k', '', '', '', '', 'fram vänster', 'ja'],
    ['Ella', 't', '', 'ja', '', '', '', ''],
    ['Liam', 'k', 'Elias; en tjej', 'ja', 'ja', '', '', '']
  ];

  return {
    parseText, guessMapping, entriesFromTable, classifyFree, groupByClass, classKey, nameKey, matcher, splitFree,
    plan, apply, toLine, toRows, posToText, parsePos, resKey, EXAMPLE_ROWS, HEAD, KIND_LABELS
  };
})();
