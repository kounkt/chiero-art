/* ============================================================
   公開版の制御
   ------------------------------------------------------------
   本文（一覧・設備・帯）はHTMLに焼いてある。ここがやるのは
   絵と、契約が届いたときの更新と、タイムラプスだけ。
   ============================================================ */

import {
  createGarden, load, recordToday, getHistory, narrate, startNarration,
  STAGES, STAGE_JA, isNum,
} from './garden.js';

// 表示順は生育順ではなく「生きている順」。石碑は最後に置く
const ORDER = ['tree', 'young_tree', 'sapling', 'sprout', 'seed', 'monument'];

document.body.classList.remove('no-js');
document.documentElement.classList.add('js');

/* ---------------- 本文の更新 ---------------- */

function paintDelta(d) {
  for (const el of document.querySelectorAll('[data-d]')) {
    const v = d[el.dataset.d];
    if (isNum(v)) el.textContent = String(v);
  }
}

function paintTenki(d) {
  const el = document.querySelector('[data-tenki]');
  if (!el) return;
  const wet = Boolean(d.no_trade);
  el.querySelector('b').textContent = wet ? '雨' : '晴';
  el.querySelector('span').textContent = wet
    ? '基準を満たす場面が、一度も来なかった'
    : '基準を満たす場面があり、判定が届いた';
}

/** 一覧。HTMLの焼き込みを、契約の値で置き換える */
export function paintList(hyp, host, { withBlocker = true } = {}) {
  if (!host || !hyp.length) return;
  host.textContent = '';
  const order = [...hyp].sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage));
  for (const h of order) {
    const row = document.createElement('article');
    row.className = 'row';
    row.dataset.stage = h.stage;
    if (typeof h.state === 'string') row.dataset.state = h.state;

    const stage = document.createElement('span');
    stage.className = 'stage';
    stage.appendChild(document.createElement('i'));
    stage.append(STAGE_JA[h.stage] || h.stage);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = h.label_public ?? '';
    if (h.epitaph) {
      const epi = document.createElement('span');
      epi.className = 'epi';
      epi.textContent = h.epitaph;
      name.appendChild(epi);
    }
    if (withBlocker && h.blocker_public) {
      const fuda = document.createElement('span');
      fuda.className = 'fuda';
      fuda.textContent = h.blocker_public;
      name.appendChild(fuda);
    }

    const clock = document.createElement('span');
    clock.className = 'clock';
    if (h.clock && isNum(h.clock.n) && isNum(h.clock.target) && h.clock.target > 0) {
      clock.append(`${h.clock.n} / ${h.clock.target}`);
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = Math.min(100, (h.clock.n / h.clock.target) * 100) + '%';
      bar.appendChild(fill);
      clock.appendChild(bar);
    } else {
      const none = document.createElement('span');
      none.className = 'none';
      none.textContent = h.stage === 'monument' ? '—' : '時計はまだ回っていない';
      clock.appendChild(none);
    }
    row.append(stage, name, clock);
    host.appendChild(row);
  }
}

const ORGAN_JA = {
  lake: { name: '井戸', note: 'データを汲む。涸れれば、庭の全部が止まります。' },
  observer: { name: '灯籠', note: '庭の外を見張る。世界の側の変化を、先に知るための灯です。' },
  market: { name: '温室', note: '眠らない系。日本株が閉じた夜も、ここだけは灯りが見えます。' },
  vault: { name: '蔵と塀', note: '檻。約束の外へ出られないように、庭を囲っています。' },
};
// status を色で言わない。姿と言葉で言う
const STATUS_JA = { green: '灯っている', yellow: '確認が要る', red: '止まっている', gray: '休んでいる' };

export function paintOrgans(organs, host) {
  if (!host || !organs.length) return;
  host.textContent = '';
  for (const o of organs) {
    const meta = ORGAN_JA[o.kind] || { name: o.kind, note: '' };
    const card = document.createElement('div');
    card.className = 'organ';
    card.dataset.status = o.status || 'gray';
    const kind = document.createElement('span');
    kind.className = 'kind'; kind.textContent = String(o.kind || '').toUpperCase();
    const b = document.createElement('b');
    b.textContent = o.name || meta.name;         // 契約の名前を優先
    const p = document.createElement('p');
    p.textContent = meta.note;
    const st = document.createElement('span');
    st.className = 'st';
    const t = o.last_ok ? new Date(o.last_ok) : null;
    const when = t && !Number.isNaN(t.getTime())
      ? `${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      : '—';
    st.textContent = `${STATUS_JA[o.status] || o.status || '—'}　最終確認 ${when}`;
    card.append(kind, b, p, st);
    host.appendChild(card);
  }
}

/* ---------------- タイムラプス ----------------
   庭はリセットされない。それを見せる唯一の方法が、過去との差分。
   追記専用の正本historyで、過去との差分を描く。
   1日分しか無い日は、スライダーを出さずに理由を書く（捏造しない）。 */

function setupTimelapse(data, garden) {
  const box = document.querySelector('[data-lapse]');
  if (!box) return;
  const { rows } = getHistory(data);
  const slider = box.querySelector('input');
  const label = box.querySelector('[data-lapse-label]');
  const diff = box.querySelector('[data-lapse-diff]');
  const note = box.querySelector('[data-lapse-note]');

  if (rows.length < 2) {
    box.dataset.state = 'thin';
    note.textContent = '正本の履歴がまだ一日分です。次のスナップショットから差が見えます。';
    slider.disabled = true;
    return;
  }

  box.dataset.state = 'ready';
  slider.min = '0'; slider.max = String(rows.length - 1);
  slider.value = String(rows.length - 1);
  slider.disabled = false;

  const today = rows[rows.length - 1];
  const render = () => {
    const i = Number(slider.value);
    const row = rows[i];
    const isToday = i === rows.length - 1;
    label.textContent = isToday ? `今日（${row.date}）` : row.date;

    // その日の頭数で庭を描き直す。個体の詳細は過去分を持っていないので、
    // 段階の頭数だけから、名前のない株として復元する
    if (!isToday) {
      const fake = [];
      for (const s of STAGES) {
        for (let k = 0; k < (row.stages?.[s] || 0); k++) {
          fake.push({ id: `${row.date}-${s}-${k}`, label_public: '', stage: s, clock: null, state: 'gray', blocker_public: null, epitaph: null });
        }
      }
      garden.render({ ...data, hypotheses: fake, daily_delta: row.daily_delta || {} });
    } else {
      garden.render(data);
    }

    // 差分。勾配そのもの
    diff.textContent = '';
    if (isToday) { diff.append('いまの庭'); return; }
    const parts = [];
    for (const s of STAGES) {
      const d = (today.stages?.[s] || 0) - (row.stages?.[s] || 0);
      if (d !== 0) parts.push({ s, d });
    }
    if (!parts.length) { diff.append('この日から、庭の姿は変わっていません'); return; }
    diff.append('この日から　');
    for (const p of parts) {
      const el = document.createElement('span');
      el.className = 'lapse-item';
      const n = document.createElement('b');
      n.textContent = (p.d > 0 ? '+' : '') + p.d;
      const s = document.createElement('small');
      s.textContent = STAGE_JA[p.s];
      el.append(n, s);
      diff.appendChild(el);
    }
  };
  slider.addEventListener('input', render);
  render();
}

/* ---------------- 出現。本文を人質に取らない ---------------- */

const rvs = () => document.querySelectorAll('.rv');
let io = null;
try {
  io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
  }, { threshold: .1, rootMargin: '0px 0px -8% 0px' });
  rvs().forEach((el) => io.observe(el));
} catch { rvs().forEach((el) => el.classList.add('on')); }
// DESIGN.md §7: 1.8秒の保険。何があっても本文は出す
setTimeout(() => rvs().forEach((el) => el.classList.add('on')), 1.8 * 1000);

/* ---------------- 起動 ---------------- */

load().then((data) => {
  const cv = document.getElementById('niwa');
  if (!data) {
    if (cv) cv.closest('.garden')?.remove();
    document.querySelector('[data-lapse]')?.remove();
    return;
  }
  recordToday(data);
  paintDelta(data.daily_delta);
  paintTenki(data.daily_delta);
  paintList(data.hypotheses, document.querySelector('[data-list]'));
  paintOrgans(data.organs, document.querySelector('[data-organs]'));
  if (cv) {
    const garden = createGarden(cv, { dense: false });
    const days = Number(data.garden?.day) || getHistory(data).rows.length;
    garden.render(data, {
      // 周期。世界が回り続けていることの目盛り。記録された日数から（捏造しない）
      onTick: (opened) => {
        const sh = document.querySelector('[data-shuki]');
        if (sh) sh.textContent = `第 ${days} 周期　地形 ${Math.round(opened * 100)}%`;
      },
    });
    startNarration(document.querySelector('[data-katari]'), narrate(data));
    setupTimelapse(data, garden);
  }
});
