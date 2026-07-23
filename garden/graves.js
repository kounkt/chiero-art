/* ============================================================
   裂け目 — 終わった仮説
   ------------------------------------------------------------
   本文はHTMLに焼いてある（bake.py）。ここがやるのは、
   契約が届いたときの更新と、裂け目の絵だけ。

   絵は庭と同じ機構——道が伸びて、途中で終わり、そこで地が割れる。
   同じ id は同じ形になる（開くたびに死に方が変わったりしない）。
   ============================================================ */

import { load, INK, isNum } from './garden.js';

document.body.classList.remove('no-js');

function seeded(str) {
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

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 一つぶんの裂け目。道が左から伸びて、途中で終わり、そこで割れる */
function drawScar(canvas, id) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.max(r.width, 1), H = Math.max(r.height, 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const rnd = seeded(id);
  const end = 0.5 + rnd() * 0.22;                 // どこで終わったか
  const pts = [[6, H * (0.62 + rnd() * 0.14)]];
  let a = -0.1 + (rnd() - 0.5) * 0.3;
  for (let k = 1; k <= 5; k++) {
    a += (rnd() - 0.5) * 0.5;
    const p = pts[pts.length - 1];
    pts.push([p[0] + Math.cos(a) * (W * 0.9 / 5), p[1] + Math.sin(a) * (H * 0.3 / 5)]);
  }
  const at = (t) => {
    const k = Math.min(0.9999, Math.max(0, t)) * (pts.length - 1);
    const i = Math.floor(k), f = k - i;
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)];
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  };

  // 道。踏み跡を重ねて濃くする
  ctx.strokeStyle = INK;
  const passes = 26;
  for (let n = 0; n < passes; n++) {
    ctx.globalAlpha = 0.055;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const [x, y] = at((k / 24) * end);
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 裂け目。道の先で、地が割れて止まっている
  const [ex, ey] = at(end);
  ctx.globalAlpha = .8; ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    const ang = rnd() * 6.283;
    const len = 9 + rnd() * 17;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + Math.cos(ang) * len, ey + Math.sin(ang) * len * 0.62);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* 契約から本文を描き直す。HTMLの焼き込みと同じ形にする */
function paint(data) {
  const graves = data.hypotheses.filter((h) => h.stage === 'monument');
  const host = document.querySelector('[data-graves]');
  const cnt = document.querySelector('[data-f="count"]');
  if (cnt) cnt.textContent = String(graves.length);
  if (!host || !graves.length) return;

  host.textContent = '';
  graves.forEach((h, i) => {
    const el = document.createElement('article');
    el.className = 'grave';

    const zu = document.createElement('div');
    zu.className = 'zu';
    const cv = document.createElement('canvas');
    zu.appendChild(cv);

    const body = document.createElement('div');
    const no = document.createElement('p');
    no.className = 'no';
    no.textContent = String(i + 1).padStart(2, '0');
    const h2 = document.createElement('h2');
    h2.textContent = h.label_public ?? '';
    body.append(no, h2);

    const dl = document.createElement('dl');
    const add = (label, text, cls) => {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = text;
      if (cls) dd.className = cls;
      dl.append(dt, dd);
    };
    // 誕生条件は契約に無い。推測で書かず、無いと書く
    add('誕生の条件', '契約が起票日を持っていないため、まだ出せません', 'gap');
    if (h.epitaph) add('死因', h.epitaph);
    const t = h.last_change ? new Date(h.last_change) : null;
    if (t && !Number.isNaN(t.getTime())) {
      const z = (n) => String(n).padStart(2, '0');
      add('終わった日', `${t.getFullYear()}.${z(t.getMonth() + 1)}.${z(t.getDate())}`, 'when');
    } else {
      add('終わった日', '記録されていません', 'gap');
    }
    body.appendChild(dl);

    const fin = document.createElement('span');
    fin.className = 'fin';
    fin.textContent = '終端 — 埋めない';
    body.appendChild(fin);

    el.append(zu, body);
    host.appendChild(el);
    drawScar(cv, h.id);
  });
}

load().then((data) => {
  if (!data) return;      // 読めなければHTMLに焼いた本文がそのまま残る
  paint(data);
});
