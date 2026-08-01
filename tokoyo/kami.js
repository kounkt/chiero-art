/* kami.js — 共通描画基盤
   点は内部解像度の実ピクセル1個（表示上0.5px相当）。
   同じ画素に溜まった量を 1-exp(-kd) で濃さに変換する。

   trail > 0: 前フレームの墨を trail 倍だけ残す（残像＝時間が画に溜まる）
   dark: 地を墨、点を光にする（深海・発光の見え方）
   数式は作品の中に、落款と同じ帯に置く。 */

const { sin, cos, tan, sqrt, hypot, abs, atan2, floor, round, min, max, pow, exp, log } = Math;
const PI = Math.PI, TAU = PI * 2;

function kami(o) {
  const host = typeof o.mount === 'string' ? document.querySelector(o.mount) : o.mount;
  const CSS = o.size || 540, D = o.dpr || 2, N = CSS * D;
  const n = o.n || 40000;
  const step = o.step || TAU / 300;
  const K = o.ink == null ? 0.5 : o.ink;
  const trail = o.trail || 0;
  const dk = !!o.dark;

  const PAPER = dk ? [11, 11, 13] : [255, 255, 255];
  const INK = dk ? [255, 255, 255] : [14, 14, 14];
  const RULE = dk ? '#2A2A2E' : '#E5E3DE';
  const TEXT = dk ? '#6E6E74' : '#8E8E8E';
  const BG = dk ? '#0B0B0D' : '#FFFFFF';

  const src = o.f.toString().replace(/\s+$/, '');
  const lines = src.split('\n');

  const mg = round(N * 0.082);
  // 数式は折り返さないので、最長行が版面に収まるところまで字の大きさを詰める
  const probe = document.createElement('canvas').getContext('2d');
  const fit = (px) => { probe.font = `${px}px "SF Mono","Menlo","Consolas",monospace`;
    return Math.max(...lines.map(l => probe.measureText(l).width)); };
  let fs = round(N * 0.0152);
  const room = N - mg * 2;
  while (fs > 6 && fit(fs) > room) fs--;
  const lh = round(fs * 1.62);
  const band = round(N * 0.030) + lines.length * lh + round(N * 0.036);
  const artH = N - band;
  const side = round(min(artH * 0.99, N * 0.88));
  const ox = (N - side) / 2, oy = round((artH - side) * 0.5);
  const S = side / 400;

  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  cv.style.cssText = `width:${CSS}px;height:${CSS}px;display:block;background:${BG}`;
  const g = cv.getContext('2d', { alpha: false });
  host.appendChild(cv);

  // ---- 落款と数式（初回のみ） ----
  g.fillStyle = BG; g.fillRect(0, 0, N, N);
  g.fillStyle = RULE;
  g.fillRect(mg, artH + round(N * 0.012), N - mg * 2, max(1, round(D * 0.5)));
  g.font = `${fs}px "SF Mono","Menlo","Consolas",monospace`;
  g.fillStyle = TEXT; g.textBaseline = 'top';
  let ty = artH + round(N * 0.030);
  for (const ln of lines) { g.fillText(ln, mg, ty); ty += lh; }
  const sz = round(N * 0.020);
  g.fillStyle = '#E60012';
  g.fillRect(N - mg - sz, artH + round(N * 0.030), sz, sz);   // 赤は一点＝落款

  // ---- 画の領域の地（方眼を敷く場合はここに描き、以後これを地として使う） ----
  g.fillStyle = BG; g.fillRect(0, 0, N, artH);
  if (o.grid) {
    const L = (v) => ox + v * S, M = (v) => oy + v * S;
    const w1 = max(1, round(D * .5));
    g.lineWidth = 0;
    for (let v = -400; v <= 800; v += 25) {                 // 細目
      const big = v % 100 === 0, ax = v === 200;
      g.fillStyle = dk ? (ax ? '#33333D' : big ? '#232329' : '#17171C')
                       : (ax ? '#D9D6D0' : big ? '#E9E7E2' : '#F2F1ED');
      const x = round(L(v)), y = round(M(v));
      if (x >= 0 && x < N) g.fillRect(x, 0, w1, artH);
      if (y >= 0 && y < artH) g.fillRect(0, y, N, w1);
    }
  }
  const bgImg = g.getImageData(0, 0, N, artH);
  const bg = new Uint32Array(bgImg.data.buffer);

  const img = g.createImageData(N, artH);
  const buf = new Uint32Array(img.data.buffer);
  buf.set(bg);

  const AREA = N * artH;
  const LUT = new Uint32Array(256);
  for (let d = 0; d < 256; d++) {
    const a = 1 - exp(-K * d / 8);
    LUT[d] = (255 << 24)
      | ((PAPER[2] + (INK[2] - PAPER[2]) * a) << 16)
      | ((PAPER[1] + (INK[1] - PAPER[1]) * a) << 8)
      | (PAPER[0] + (INK[0] - PAPER[0]) * a);
  }

  let t = 0;

  // --- 残像なし: 触れた画素だけを戻す ---
  const dens = new Uint16Array(AREA);
  let hit = new Int32Array(n), prev = new Int32Array(n);
  let nPrev = 0;

  // --- 残像あり: 墨のある画素だけを台帳で持ち、そこだけ減衰させる
  //     （全画素を毎フレーム走査すると、作品を並べたときにフレーム落ちする） ---
  const acc = trail ? new Float32Array(AREA) : null;
  const live = trail ? new Int32Array(AREA) : null;
  let nLive = 0;

  function frame() {
    if (trail) {
      for (let i = 0; i < n; i++) {
        const p = o.f(i, t);
        const x = (ox + p[0] * S) | 0, y = (oy + p[1] * S) | 0;
        if (x < 0 || y < 0 || x >= N || y >= artH) continue;
        const idx = y * N + x;
        if (acc[idx] === 0) live[nLive++] = idx;
        acc[idx] += 8;
      }
      let w = 0;
      for (let k = 0; k < nLive; k++) {
        const idx = live[k], a = acc[idx];
        if (a < 0.05) { acc[idx] = 0; buf[idx] = bg[idx]; continue; }
        buf[idx] = LUT[a > 255 ? 255 : a | 0];
        acc[idx] = a * trail;
        live[w++] = idx;
      }
      nLive = w;
    } else {
      for (let k = 0; k < nPrev; k++) buf[prev[k]] = bg[prev[k]];
      let nHit = 0;
      for (let i = 0; i < n; i++) {
        const p = o.f(i, t);
        const x = (ox + p[0] * S) | 0, y = (oy + p[1] * S) | 0;
        if (x < 0 || y < 0 || x >= N || y >= artH) continue;
        const idx = y * N + x;
        if (dens[idx] === 0 && nHit < n) hit[nHit++] = idx;
        dens[idx] += 8;
      }
      for (let k = 0; k < nHit; k++) {
        const idx = hit[k];
        buf[idx] = LUT[min(255, dens[idx])];
        dens[idx] = 0;
      }
      const tmp = prev; prev = hit; hit = tmp; nPrev = nHit;
    }
    g.putImageData(img, 0, 0);
  }

  // 時刻はフレーム数でなく実時間で進める。
  // step=TAU/300 は 60fps 換算なので、1周 = 5秒。フレーム落ちしても速さが変わらない。
  const RATE = step * 60;
  let t0 = 0;

  frame();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let run = false;
    const tick = (ms) => {
      if (!run) return;
      if (!t0) t0 = ms;
      t = (ms - t0) / 1000 * RATE;
      frame();
      requestAnimationFrame(tick);
    };
    // 画面に入っている作品だけ動かす（並べたときのフレーム落ちを防ぐ）
    new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting && !run) { run = true; t0 = 0; requestAnimationFrame(tick); }
        else if (!e.isIntersecting) run = false;
      }
    }, { rootMargin: '150px' }).observe(cv);
  }

  // 書き出し用: 残像は履歴に依存するので、飛ばさず順に進める
  return {
    canvas: cv, frame, src,
    seek(v) { t = v; frame(); },
    advance() { t += step; frame(); },
    reset() { t = 0; frame(); }
  };
}
