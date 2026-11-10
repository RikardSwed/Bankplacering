/* Bänkplacering – lottningsmotor
 * Geometri för klassrummet + optimering (simulated annealing) av placeringen.
 */
const Lottning = (() => {
  'use strict';

  // Bygger platser, bänkkompisar och sidogrannar ur ett klassrum.
  // Varje bänk har två platser. Bänkar som står kant i kant i samma riktning
  // gör att platserna på kanterna blir grannar.
  function geometry(room) {
    const seats = [];
    const cell = new Map();
    room.desks.forEach(d => {
      const v = d.orient === 'v';
      for (let i = 0; i < 2; i++) {
        const x = d.x + (v ? 0 : i), y = d.y + (v ? i : 0);
        const s = { id: d.id + ':' + i, deskId: d.id, idx: seats.length, x, y, v, side: i };
        seats.push(s);
        cell.set(x + ',' + y, s);
      }
    });
    const partner = seats.map(s => (s.side === 0 ? s.idx + 1 : s.idx - 1));
    const neigh = seats.map(s => {
      const out = [];
      const cands = s.v ? [[s.x, s.y - 1], [s.x, s.y + 1]] : [[s.x - 1, s.y], [s.x + 1, s.y]];
      cands.forEach(([x, y]) => {
        const o = cell.get(x + ',' + y);
        if (o && o.deskId !== s.deskId && o.v === s.v) out.push(o.idx);
      });
      return out;
    });
    const desks = room.desks.map((d, k) => [2 * k, 2 * k + 1]);
    const seatIndex = new Map(seats.map(s => [s.id, s.idx]));
    // 3×3-zoner för platsönskemål
    const rb = bands(seats.map(s => s.y)), cb = bands(seats.map(s => s.x));
    seats.forEach(s => {
      const rows = rb.get(s.y), cols = cb.get(s.x);
      let mask = 0;
      rows.forEach(r => cols.forEach(c => { mask |= 1 << (r * 3 + c); }));
      s.zone = mask; s.zr = rows[0]; s.zc = cols[0];
    });
    const zone = seats.map(s => s.zone);
    return { seats, partner, neigh, desks, seatIndex, zone };
  }

  // Delar in raderna (eller kolumnerna) i tre band: fram/mitten/bak eller
  // vänster/mitten/höger. Rad 0 = närmast tavlan. Vänster/höger är sett från
  // eleverna med ansiktet mot tavlan (så som klassrummet ritas i elevvyn).
  function bands(values) {
    const u = [...new Set(values)].sort((a, b) => a - b);
    const n = u.length, map = new Map();
    const k = Math.max(1, Math.round(n / 3));
    u.forEach((v, i) => {
      let z;
      if (n === 1) z = [0, 1, 2];
      else if (n === 2) z = i === 0 ? [0, 1] : [1, 2];
      else z = [i < k ? 0 : i >= n - k ? 2 : 1];
      map.set(v, z);
    });
    return map;
  }

  // Elevens platsönskemål som bitmask över de 9 rutorna (0 = inget önskemål).
  function posMaskOf(s) {
    let m = 0;
    ((s.pos && s.pos.cells) || []).forEach(c => { if (c >= 0 && c < 9) m |= 1 << c; });
    return m;
  }

  function prep(room, students, opts) {
    const G = geometry(room);
    const n = students.length;
    const idx = new Map(students.map((s, i) => [s.id, i]));
    const W = new Uint8Array(n * n), A = new Uint8Array(n * n);
    const hasWish = new Uint8Array(n), g = new Uint8Array(n);
    const usePos = opts.pos !== false;
    const pm = new Uint16Array(n), ps = new Uint8Array(n);
    students.forEach((s, i) => {
      g[i] = s.gender === 'k' ? 1 : s.gender === 't' ? 2 : 0;
      if (usePos) { pm[i] = posMaskOf(s); ps[i] = pm[i] && s.pos.strict ? 1 : 0; }
      (s.wishes || []).forEach(id => {
        const j = idx.get(id);
        if (j !== undefined && j !== i) { W[i * n + j] = 1; hasWish[i] = 1; }
      });
      (s.avoid || []).forEach(id => {
        const j = idx.get(id);
        if (j !== undefined && j !== i) { A[i * n + j] = 1; A[j * n + i] = 1; }
      });
    });
    return {
      G, n, idx, W, A, hasWish, g, pm, ps,
      useW: opts.wishes !== false,
      useA: opts.avoid !== false,
      rule: opts.gender || 'none'
    };
  }

  // Poäng för en placering (högre = bättre).
  function score(P, arr) {
    const { G, n, W, A, hasWish, g, useW, useA, rule } = P;
    const posM = P.pm, posS = P.ps;
    const { partner, neigh, zone } = G;
    let sc = 0;
    for (let p = 0; p < arr.length; p++) {
      const a = arr[p];
      if (a < 0) continue;
      let met = 0, pm = 0, adj = 0;
      const b = arr[partner[p]];
      if (b >= 0) {
        adj = 1;
        if (useW && W[a * n + b]) { met++; pm = 1; if (W[b * n + a]) sc += 6; }
        if (useA && A[a * n + b]) sc -= 400;
        if (rule !== 'none' && g[a] && g[b]) {
          const same = g[a] === g[b];
          if ((rule === 'same') !== same) sc -= 30;
        }
      }
      const nb = neigh[p];
      for (let k = 0; k < nb.length; k++) {
        const c = arr[nb[k]];
        if (c < 0) continue;
        adj = 1;
        if (useW && W[a * n + c]) met++;
        if (useA && A[a * n + c]) sc -= 400;
        if (rule !== 'none' && g[a] && g[c]) {
          const same = g[a] === g[c];
          if ((rule === 'same') !== same) sc -= 8;
        }
      }
      if (useW && hasWish[a] && met > 0) sc += 100 + pm * 15 + (met - 1) * 4;
      if (!adj) sc -= 20; // sitter ensam – låt hellre tomma platser samlas i hela bänkar
      if (posM[a] && !(zone[p] & posM[a])) sc -= posS[a] ? 3000 : 70; // platsönskemål
    }
    return sc;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const rnd = n => Math.floor(Math.random() * n);

  /**
   * mode 'full'  – lotta om allt (vem man sitter med och var)
   * mode 'desks' – behåll bänkkompisarna, lotta bara vilken bänk de hamnar vid
   */
  function run({ room, students, assignment = {}, locks = [], mode = 'full', opts = {} }) {
    const P = prep(room, students, opts);
    const { G, n } = P;
    const m = G.seats.length;
    if (n > m) throw new Error(`För få platser: ${n} elever men ${m} platser.`);

    const base = new Array(m).fill(-1);
    const placed = new Uint8Array(n);
    Object.entries(assignment).forEach(([sid, stid]) => {
      const p = G.seatIndex.get(sid), i = P.idx.get(stid);
      if (p !== undefined && i !== undefined && !placed[i] && base[p] < 0) { base[p] = i; placed[i] = 1; }
    });
    const lockedSeat = new Uint8Array(m);
    locks.forEach(sid => {
      const p = G.seatIndex.get(sid);
      if (p !== undefined && base[p] >= 0) lockedSeat[p] = 1;
    });

    let makeInit, move;

    if (mode === 'full') {
      const free = [];
      const lockedStud = new Set();
      for (let p = 0; p < m; p++) {
        if (lockedSeat[p]) lockedStud.add(base[p]); else free.push(p);
      }
      const pool = [];
      for (let i = 0; i < n; i++) if (!lockedStud.has(i)) pool.push(i);
      // Elever med strikt platskrav placeras först, i en tillåten ruta.
      const order = pool.slice().sort((a, b) => P.ps[b] - P.ps[a]);
      makeInit = () => {
        const arr = new Array(m).fill(-1);
        for (let p = 0; p < m; p++) if (lockedSeat[p]) arr[p] = base[p];
        const seats = shuffle(free.slice());
        order.forEach(i => {
          let k = P.ps[i] ? seats.findIndex(p => G.zone[p] & P.pm[i]) : 0;
          if (k < 0) k = 0;
          arr[seats[k]] = i;
          seats.splice(k, 1);
        });
        return arr;
      };
      move = arr => {
        if (free.length < 2) return null;
        for (let t = 0; t < 10; t++) {
          const i = free[rnd(free.length)], j = free[rnd(free.length)];
          if (i === j || (arr[i] < 0 && arr[j] < 0)) continue;
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
          return [[i, j]];
        }
        return null;
      };
    } else {
      // Elever som saknar plats (t.ex. nytillagda) får en slumpad tom plats först.
      const empty = shuffle(base.map((v, p) => (v < 0 ? p : -1)).filter(p => p >= 0));
      for (let i = 0; i < n; i++) if (!placed[i]) base[empty.pop()] = i;
      const movDesks = G.desks.filter(([a, b]) => !lockedSeat[a] && !lockedSeat[b]);
      makeInit = () => {
        const arr = base.slice();
        const contents = shuffle(movDesks.map(([a, b]) => [base[a], base[b]]));
        movDesks.forEach(([a, b], k) => {
          let [x, y] = contents[k];
          if (Math.random() < 0.5) [x, y] = [y, x];
          arr[a] = x; arr[b] = y;
        });
        return arr;
      };
      move = arr => {
        if (!movDesks.length) return null;
        if (movDesks.length < 2 || Math.random() < 0.25) {
          const [a, b] = movDesks[rnd(movDesks.length)];
          if (arr[a] < 0 && arr[b] < 0) return null;
          const tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp;
          return [[a, b]];
        }
        const d1 = movDesks[rnd(movDesks.length)], d2 = movDesks[rnd(movDesks.length)];
        if (d1 === d2) return null;
        if (arr[d1[0]] < 0 && arr[d1[1]] < 0 && arr[d2[0]] < 0 && arr[d2[1]] < 0) return null;
        const swaps = [[d1[0], d2[0]], [d1[1], d2[1]]];
        swaps.forEach(([i, j]) => { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; });
        return swaps;
      };
    }

    const restarts = opts._restarts || 12;
    const iters = opts._iters || Math.min(80000, 5000 + m * 1500);
    const T0 = 40, T1 = 0.5;
    let best = null, bestS = -Infinity;
    for (let r = 0; r < restarts; r++) {
      const arr = makeInit();
      let cs = score(P, arr), lb = arr.slice(), ls = cs;
      for (let it = 0; it < iters; it++) {
        const T = T0 * Math.pow(T1 / T0, it / iters);
        const sw = move(arr);
        if (!sw) continue;
        const ns = score(P, arr);
        if (ns >= cs || Math.random() < Math.exp((ns - cs) / T)) {
          cs = ns;
          if (cs > ls) { ls = cs; lb = arr.slice(); }
        } else {
          for (let k = sw.length - 1; k >= 0; k--) {
            const [i, j] = sw[k]; const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
          }
        }
      }
      if (ls > bestS || (ls === bestS && Math.random() < 0.5)) { bestS = ls; best = lb; }
    }

    const out = {};
    best.forEach((i, p) => { if (i >= 0) out[G.seats[p].id] = students[i].id; });
    return { assignment: out, score: bestS };
  }

  // Analys av en placering – används för rapport och markeringar.
  function analyze(room, students, assignment, opts = {}) {
    const G = geometry(room);
    const byId = new Map(students.map(s => [s.id, s]));
    const at = G.seats.map(s => { const id = assignment[s.id]; return byId.has(id) ? id : null; });
    const info = {};
    const sum = { withWish: 0, met: 0, unmet: [], avoid: [], same: 0, mixed: 0, unplaced: [], posWith: 0, posMet: 0, posFail: [], posStrictFail: [] };
    const placed = new Set(at.filter(Boolean));
    G.seats.forEach((seat, p) => {
      const id = at[p];
      if (!id) return;
      const s = byId.get(id);
      const partner = at[G.partner[p]];
      const neigh = G.neigh[p].map(q => at[q]).filter(Boolean);
      const adj = (partner ? [partner] : []).concat(neigh);
      const wishes = (s.wishes || []).filter(w => byId.has(w));
      const hasWish = opts.wishes !== false && wishes.length > 0;
      const metIds = hasWish ? adj.filter(x => wishes.includes(x)) : [];
      const avoidHit = opts.avoid !== false
        ? adj.filter(x => (s.avoid || []).includes(x) || (byId.get(x).avoid || []).includes(id))
        : [];
      const pmask = opts.pos !== false ? posMaskOf(s) : 0;
      const posOk = pmask ? !!(G.zone[p] & pmask) : null;
      info[id] = { seatId: seat.id, partner, neigh, hasWish, metIds, avoidHit, posOk, posStrict: !!(pmask && s.pos.strict), zr: seat.zr, zc: seat.zc };
      if (pmask) {
        sum.posWith++;
        if (posOk) sum.posMet++;
        else if (s.pos.strict) sum.posStrictFail.push(id);
        else sum.posFail.push(id);
      }
      if (hasWish) { sum.withWish++; if (metIds.length) sum.met++; else sum.unmet.push(id); }
      avoidHit.forEach(x => { if (id < x) sum.avoid.push([id, x]); });
      if (partner && seat.side === 0) {
        const g1 = s.gender, g2 = byId.get(partner).gender;
        if (g1 && g2) { if (g1 === g2) sum.same++; else sum.mixed++; }
      }
    });
    students.forEach(s => { if (!placed.has(s.id)) sum.unplaced.push(s.id); });
    return { info, sum };
  }

  return { geometry, run, analyze, posMaskOf };
})();
