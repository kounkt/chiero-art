/* ============================================================
   庭 — 仮説の生態図 v2
   ------------------------------------------------------------
   典拠: chiero_brand/DESIGN.md
   契約: ecosystem_v2（Codexが台帳から生成。ここは読むだけ）

   守っていること:
   - 本文をJSの人質にしない。HTMLに焼いた一覧が本文で、ここは絵と更新だけ
   - 赤は庭全体で一点。stage:"tree" の実だけ（＝詰まりを取る一点）
   - state / status(green|yellow|red|gray) を**色で描かない**。DESIGN.md §2に
     セマンティックカラーは存在しないため、姿（枯れ・傾き・濃度）に落とす
   - ライブラリゼロ。外部通信は同一オリジンの ecosystem.json のみ
   - 数字を捏造しない。契約に無い値は描かない
   ============================================================ */

export const RED = '#E60012';
export const INK = '#0E0E0E';
export const FAINT = '#8E8E8E';
export const LINE = '#E5E3DE';

export const STAGES = ['seed', 'sprout', 'sapling', 'young_tree', 'tree', 'monument'];
export const STAGE_JA = { seed: '種', sprout: '発芽', sapling: '苗', young_tree: '若木', tree: '樹・実弾', monument: '石碑' };

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------------- 契約の読み込み ---------------- */

/** 知らない stage は描かない。新種を勝手に発明しない */
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schema !== 'ecosystem_v2') return null;   // 版数が変わったら黙って従わない
  const hyp = Array.isArray(raw.hypotheses) ? raw.hypotheses.filter((h) => STAGES.includes(h?.stage)) : [];
  return {
    generated_at: typeof raw.generated_at === 'string' ? raw.generated_at : null,
    garden: raw.garden && typeof raw.garden === 'object' ? raw.garden : {},
    totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {},
    daily_delta: raw.daily_delta && typeof raw.daily_delta === 'object' ? raw.daily_delta : {},
    hypotheses: hyp,
    organs: Array.isArray(raw.organs) ? raw.organs : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

export async function load() {
  try {
    const res = await fetch('ecosystem.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return sanitize(await res.json());
  } catch {
    return null;   // 読めなければHTMLに焼いたスナップショットのまま。数字を捏造しない
  }
}

/* ---------------- 積み上がりの記録 ----------------
   v2ではサーバの追記専用historyだけが正本。閲覧端末は記録を持たない。 */

const HMAX = 36500;

export function stageCount(hyp) {
  const c = {};
  for (const s of STAGES) c[s] = 0;
  for (const h of hyp) c[h.stage]++;
  return c;
}

/** 互換用の無操作関数。履歴への書込みはサーバ生成器だけが行う。 */
export function recordToday(data) {
  return data?.history?.at?.(-1) || null;
}

/** 追記専用のサーバ正本だけを読む。 */
export function getHistory(data) {
  return { source: 'contract', rows: (data.history || []).slice(-HMAX) };
}


/* ---- 庭が自分の状態を語る ----
   参考作品の「中央の灯に、新しい慣習が生まれた」に当たる装置。
   ただし文は契約の実値からしか組まない。物語を作らない。 */
export function narrate(data) {
  const d = data.daily_delta;
  const lines = [];
  const live = data.hypotheses.filter((h) => h.stage !== 'monument');
  const tree = live.find((h) => h.stage === 'tree');

  if (isNum(d.advanced) && d.advanced > 0) lines.push(`${d.advanced}つの道が、今日ぶん伸びた。`);
  if (isNum(d.born) && d.born > 0) lines.push(`${d.born}つの道が、今日はじめて踏まれた。`);
  if (isNum(d.died) && d.died > 0) lines.push(`${d.died}つの道が、途中で終わった。裂け目として残る。`);
  if (d.no_trade) lines.push('基準を満たす場面が来なかった。歩かなかったことが、約束を守った証拠になる。');

  for (const h of live) {
    if (h.blocker_public) lines.push(`「${h.label_public}」は、${h.blocker_public}。`);
  }
  for (const o of data.organs) {
    if (o.status === 'red') lines.push(`「${o.name}」が止まっている。ここが直るまで、庭は先へ行けない。`);
  }
  if (tree?.clock && isNum(tree.clock.n) && isNum(tree.clock.target)) {
    lines.push(`「${tree.label_public}」の時計は、${tree.clock.target}件のうち${tree.clock.n}件。満ちたら、判定は一度だけ。`);
  }
  const mon = data.hypotheses.filter((h) => h.stage === 'monument');
  if (mon.length) lines.push(`これまでに${mon.length}つの裂け目が残った。埋めない。`);
  return lines;
}

/** 一定間隔で語りを差し替える。止めるための関数を返す */
export function startNarration(el, lines, ms = 7000) {
  if (!el || !lines.length) return () => {};
  let i = 0;
  const show = () => {
    el.textContent = lines[i % lines.length];
    el.dataset.on = '1';
    i++;
  };
  show();
  if (reduced || lines.length === 1) return () => {};
  const id = setInterval(() => { el.dataset.on = '0'; setTimeout(show, 420); }, ms);
  return () => clearInterval(id);
}


/* ---------------- 庭 — 筆致の堆積 v2（滑らかさ優先） ----------------
   絵は「時間が残した痕跡」。曲線は Catmull-Rom、筆は先細り。

   前版の非・滑らかさは三つの原因だった。全部この版で断つ:
     ① 成長がフレーム依存（w.t を毎フレーム率で追わせていた）。
        → w.t を時間の純関数にする。60Hzでも120Hzでも同じ速さ。ゴム遅延なし
     ② 蓄積バッファに毎フレーム筆をスタンプ→密度が這ってチラつく。
        → 蓄積をやめ、毎フレーム 0..t を新品で描き直す。継ぎ目もチラつきも消える
     ③ 雨が毎フレーム種を作り直してカクつく。
        → 粒を保持して連続に流す

   randomness: 事実は不変、筆は毎回ちがう（訪問ごとに VISIT を引き直す）。
   赤は実弾の一点だけ。
   ============================================================ */

const VISIT = (Math.random() * 1e9) | 0;

function rngFrom(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const brushOf = (id, salt = '') => rngFrom(`${id}|${salt}|${VISIT}`);

function fieldMaker(rnd) {
  const a = [];
  for (let i = 0; i < 5; i++) a.push({ fx: 0.6 + rnd() * 2.4, fy: 0.6 + rnd() * 2.4, p: rnd() * 6.283, w: (rnd() - 0.5) });
  return (u, v) => { let s = 0; for (const o of a) s += Math.sin(u * o.fx + o.p) * Math.cos(v * o.fy + o.p) * o.w; return s; };
}

function spline(pts, per = 24) {
  if (pts.length < 2) return pts.slice();
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* 先細りの筆。0..to（0..1）ぶんだけ描く。毎フレーム新品で引くので蓄積の継ぎ目が出ない */
function brushStroke(c, pts, w0, w1, alpha, to = 1) {
  const last = Math.max(1, Math.floor(to * (pts.length - 1)));
  if (last < 2) return;
  const L = [], R = [];
  for (let i = 0; i <= last; i++) {
    const p = pts[i];
    const q = pts[Math.min(i + 1, pts.length - 1)];
    const o = pts[Math.max(i - 1, 0)];
    const dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const t = i / last;
    const w = (w0 + (w1 - w0) * t) / 2;
    L.push([p[0] + nx * w, p[1] + ny * w]);
    R.push([p[0] - nx * w, p[1] - ny * w]);
  }
  c.globalAlpha = alpha;
  c.beginPath();
  c.moveTo(L[0][0], L[0][1]);
  for (const p of L) c.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath();
  c.fill();
  c.globalAlpha = 1;
}

const REACH = { seed: 0.20, sprout: 0.32, sapling: 0.50, young_tree: 0.74, tree: 1.0, monument: 0.58 };
const OPENING = 30;                              // 秒。ゆっくり流れ出て静かに置かれる
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function createGarden(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { render() {}, destroy() {} };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const dense = Boolean(opts.dense);
  let W = 0, H = 0, raf = null, t0 = performance.now();
  let data = null, wet = false, fruitId = null;
  let walkers = [], scars = [], drops = [];
  let U = 1, cx = 0, cy = 0, R = 1;
  let hot = null, opened = 0;
  const hit = [];
  let onTick = null;

  const SPRINGS = 3;
  function springOf(h) {
    const r = brushOf(h.id, 'spring');
    const k = Math.floor(r() * SPRINGS) % SPRINGS;
    const a = -Math.PI / 2 + (k / SPRINGS) * 6.283 + (r() - 0.5) * 0.5;
    return [cx + Math.cos(a) * R * 0.12, cy + Math.sin(a) * R * 0.12 * 0.62];
  }

  function pathOf(h, i, n) {
    const rnd = brushOf(h.id);
    const field = fieldMaker(rnd);
    const reach = REACH[h.stage] ?? 0.3;
    const [sx, sy] = springOf(h);
    let a = (i / Math.max(n, 1)) * 6.283 + (rnd() - 0.5) * 0.9;
    const ctrl = [[sx, sy]];
    let x = sx, y = sy;
    const steps = 6, seg = (R * reach) / steps;
    for (let k = 1; k <= steps; k++) {
      a += field(x / (R * 0.5), y / (R * 0.5)) * 0.42 + (rnd() - 0.5) * 0.12;
      x += Math.cos(a) * seg; y += Math.sin(a) * seg * 0.62;
      ctrl.push([x, y]);
    }
    return spline(ctrl, 24);
  }

  /* 一本の道を、少しずれた筆の束にする（束は一度だけ決める＝滲みが動かない） */
  function strokesOf(h, pts) {
    const rnd = brushOf(h.id, 'w');
    const beat = h.clock && isNum(h.clock.n) && isNum(h.clock.target) && h.clock.target > 0
      ? Math.min(1, h.clock.n / h.clock.target) : 0;
    const n = 3 + Math.round(beat * 3);
    const strokes = [];
    for (let k = 0; k < n; k++) {
      const j = (rnd() - 0.5) * 2.2;
      strokes.push({ pts: pts.map(([x, y]) => [x + j, y + j * 0.5]), w: 0.7 + rnd() * 0.5 });
    }
    return { beat, strokes, delay: rnd() * 0.22 };
  }

  function setData(d) {
    data = d;
    wet = Boolean(d.daily_delta.no_trade);
    const all = d.hypotheses;
    const live = all.filter((h) => h.stage !== 'monument');
    fruitId = live.find((h) => h.stage === 'tree')?.id ?? null;

    walkers = live.map((h, i) => {
      const pts = pathOf(h, i, live.length);
      const s = strokesOf(h, pts);
      return { h, pts, t: 0, ...s };
    });
    scars = all.filter((h) => h.stage === 'monument').map((h, i, arr) => {
      const pts = pathOf(h, i + 0.5, Math.max(arr.length, 1));
      const rnd = brushOf(h.id, 'scar');
      const end = 0.44 + rnd() * 0.28;
      const strokes = [];
      for (let k = 0; k < 4; k++) {
        const j = (rnd() - 0.5) * 1.8;
        strokes.push({ pts: pts.map(([x, y]) => [x + j, y + j * 0.5]), w: 0.8 + rnd() * 0.4 });
      }
      const [ex, ey] = pts[Math.floor(end * (pts.length - 1))];
      const cracks = [];
      for (let k = 0; k < 3; k++) { const a = rnd() * 6.283, len = (6 + rnd() * 14); cracks.push([a, len]); }
      return { h, pts, end, strokes, ex, ey, cracks, delay: 0.4 + rnd() * 0.2 };
    });
  }

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(r.width, 1); H = Math.max(r.height, 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    cx = W * 0.40; cy = H * 0.5;
    R = Math.min(W * 0.44, H * 0.84);
    U = Math.min(Math.max(R / 240, 0.7), 1.7);
    drops = Array.from({ length: wet ? 20 : 0 }, () => {
      const rnd = Math.random;
      return { x: rnd() * W, y: rnd() * H, len: 9 + rnd() * 13, v: 42 + rnd() * 34, drift: 10 + rnd() * 8 };
    });
    if (data) setData(data);
    t0 = performance.now();
  }

  /* 成長は時間の純関数。フレーム率に依らない。株ごとに少し出遅れる */
  function advance(T) {
    const done = Math.min(1, T / OPENING);
    for (const w of walkers) {
      const local = (done - w.delay) / (1 - w.delay);
      w.t = easeOut(local);                      // ease-out で流れ出て、終わりで静かに減速
    }
    opened = done;
  }

  function drawScars(T) {
    const done = Math.min(1, T / OPENING);
    for (const s of scars) {
      const local = easeOut((done - s.delay) / (1 - s.delay));
      if (local <= 0) continue;
      const to = s.end * local;
      ctx.fillStyle = INK;
      for (const st of s.strokes) brushStroke(ctx, st.pts, 2.6 * U, 0.5 * U, 0.1, to);
      if (local > 0.98) {                        // 割れは、道が終点に届いてから
        ctx.globalAlpha = .5; ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * U;
        for (const [a, len] of s.cracks) {
          ctx.beginPath();
          ctx.moveTo(s.ex, s.ey);
          ctx.lineTo(s.ex + Math.cos(a) * len * U, s.ey + Math.sin(a) * len * U * 0.62);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      hit.push({ h: s.h, x: s.ex, y: s.ey, rad: 16 * U });
    }
  }

  function drawRoads() {
    ctx.fillStyle = INK;
    for (const w of walkers) {
      if (w.t <= 0.001) continue;
      const wide = (1.2 + REACH[w.h.stage] * 4.2) * U;
      const dim = w.h.state === 'gray' ? .35 : w.h.state === 'red' ? .55 : 1;
      for (const s of w.strokes) brushStroke(ctx, s.pts, wide * s.w, wide * s.w * 0.2, 0.055 * dim, w.t);
    }
  }

  const labels = [];
  function placeLabel(text, [x, y], alpha) {
    if (!text) return;
    ctx.font = '10.5px "Hiragino Sans", sans-serif';
    const w = ctx.measureText(text).width, h = 13;
    for (const [dx, dy] of [[11 * U, -8 * U], [11 * U, 15 * U], [-w - 11 * U, -8 * U], [-w - 11 * U, 15 * U]]) {
      const box = { x: x + dx, y: y + dy - h, w, h: h + 3 };
      if (box.x < 2 || box.x + box.w > W - 2 || box.y < 2 || box.y + box.h > H - 2) continue;
      if (labels.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
      labels.push(box);
      ctx.globalAlpha = alpha; ctx.fillStyle = FAINT;
      ctx.fillText(text, box.x, box.y + h); ctx.globalAlpha = 1;
      return;
    }
  }

  function drawLive(T) {
    labels.length = 0;
    for (const w of walkers) {
      const h = w.h;
      const idx = Math.max(0, Math.floor(Math.min(w.t, 1) * (w.pts.length - 1)));
      const [x, y] = w.pts[idx];
      const dim = h.state === 'gray' ? .3 : h.state === 'red' ? .5 : 1;

      // 先端。ごく静かに息づく（滑らかな正弦。これが唯一の恒常運動）
      const breath = reduced ? 1 : 1 + Math.sin(T * 0.9 + w.delay * 20) * 0.14;
      ctx.globalAlpha = .5 * dim; ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x, y, (1.1 + REACH[h.stage] * 1.9) * U * breath, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;

      if (h.blocker_public) {
        const [bx, by] = w.pts[Math.min(w.pts.length - 1, idx + 10)];
        ctx.globalAlpha = .28 * dim; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.setLineDash([2.5 * U, 3.5 * U]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      if (opened > 0.7 && (h.stage === 'tree' || h.stage === 'young_tree')) {
        placeLabel(h.label_public || '', w.pts[w.pts.length - 1], .34 * dim);
      }
      if (h.id === fruitId) {
        const pulse = reduced ? 0 : Math.sin(T * 1.3) * .5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 17 * U);
        g.addColorStop(0, 'rgba(230,0,18,.2)'); g.addColorStop(1, 'rgba(230,0,18,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 17 * U, 0, 6.283); ctx.fill();
        ctx.fillStyle = RED;
        ctx.beginPath(); ctx.arc(x, y, (3.4 + pulse) * U, 0, 6.283); ctx.fill();
      }
      hit.push({ h, x, y, rad: 15 * U });
    }
  }

  function drawOrgans(T) {
    data.organs.forEach((o, i) => {
      const a = (i / data.organs.length) * 6.283 - Math.PI / 2;
      const x = cx + Math.cos(a) * R * 1.16, y = cy + Math.sin(a) * R * 1.16 * 0.62;
      const dim = o.status === 'red' ? .16 : o.status === 'yellow' ? .32 : .5;
      if (o.status === 'green') {
        const fl = reduced ? .4 : .3 + Math.sin(T * 1.2 + i * 1.7) * .14;   // 滑らかな明滅
        const g = ctx.createRadialGradient(x, y, 0, x, y, 11 * U);
        g.addColorStop(0, `rgba(255,255,255,${fl})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 11 * U, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = dim; ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x, y, 1.9 * U, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
      hit.push({ h: { stage: 'organ', label_public: o.name, _organ: o }, x, y, rad: 11 * U });
    });
  }

  /* 雨。粒を保持して連続に流す（毎フレーム作り直さない） */
  function drawRain(dt) {
    if (!wet || reduced) return;
    ctx.strokeStyle = INK; ctx.globalAlpha = .06; ctx.lineWidth = 1;
    for (const d of drops) {
      d.y += d.v * dt; d.x += d.drift * dt;
      if (d.y > H + d.len) { d.y = -d.len; d.x = Math.random() * (W + 40) - 20; }
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * 0.18, d.y + d.len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawTag() {
    if (!hot || !dense) return;
    const h = hot.h;
    const lines = h._organ
      ? [`設備　${h.label_public}`, `状態　${{ green: '灯っている', yellow: '確認が要る', red: '止まっている' }[h._organ.status] || ''}`]
      : [`${STAGE_JA[h.stage] || h.stage}　${h.label_public}`,
         h.clock && isNum(h.clock.n) ? `時計 ${h.clock.n} / ${h.clock.target}` : null,
         h.blocker_public ? `待ち　${h.blocker_public}` : null, h.epitaph || null].filter(Boolean);
    ctx.save();
    ctx.font = '11px "Hiragino Sans", sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const hh = lines.length * 17 + 12;
    let bx = hot.x + 16, by = hot.y - hh - 10;
    if (bx + w > W) bx = hot.x - w - 16;
    if (by < 2) by = hot.y + 14;
    ctx.globalAlpha = .97; ctx.fillStyle = '#FFF';
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.fillRect(bx, by, w, hh); ctx.strokeRect(bx, by, w, hh);
    lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? INK : FAINT; ctx.fillText(l, bx + 10, by + 20 + i * 17); });
    ctx.globalAlpha = .5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(hot.x, hot.y, 14 * U, 0, 6.283); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function frame() {
    if (!data) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const T = (now - t0) / 1000;
    hit.length = 0;

    advance(T);
    ctx.clearRect(0, 0, W, H);
    drawRain(dt);
    drawScars(T);
    drawRoads();          // 毎フレーム 0..t を新品で。蓄積の継ぎ目もチラつきも無い
    drawOrgans(T);
    drawLive(T);
    drawTag();

    if (onTick) onTick(opened, T);
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!dense) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    hot = hit.find((t) => Math.hypot(t.x - mx, t.y - my) < t.rad) || null;
    canvas.style.cursor = hot ? 'pointer' : 'default';
    if (reduced) frame();
  });
  canvas.addEventListener('pointerleave', () => { hot = null; if (reduced) frame(); });

  let rt = null, lastW = 0;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const w = canvas.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 40) return;
      lastW = w; fit(); if (reduced) frame();
    }, 220);
  };
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => {
    if (reduced || !data) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
    else { last = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }
  });

  return {
    render(d, o = {}) {
      if (typeof o.onTick === 'function') onTick = o.onTick;
      data = d;
      setData(d); fit(); lastW = W;
      cancelAnimationFrame(raf); raf = null;
      last = performance.now();
      if (reduced) { t0 = performance.now() - OPENING * 1000; frame(); }   // 静止画は完成形
      else frame();
    },
    destroy() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); },
  };
}
