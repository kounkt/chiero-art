/* ============================================================
   本人用ビューの制御 — 毎朝1分で終わること
   ------------------------------------------------------------
   公開版と同じ契約・同じ描画エンジン。違うのは密度と、
   ホバーで中身が出ることだけ。ここは対外の面ではない。
   ============================================================ */

import {
  createGarden, load, recordToday, getHistory, narrate, startNarration,
  STAGES, STAGE_JA, isNum,
} from './garden.js';

// 表示順は生育順ではなく「生きている順」。石碑は最後に置く
const ORDER = ['tree', 'young_tree', 'sapling', 'sprout', 'seed', 'monument'];

const STATUS_JA = { green: '灯っている', yellow: '確認が要る', red: '止まっている', gray: '休んでいる' };
const z = (n) => String(n).padStart(2, '0');

/* ---- 今日の一行。ここだけ読めば終わる ---- */
function paintHead(data) {
  const d = data.daily_delta;
  const el = document.querySelector('[data-head]');
  const sub = document.querySelector('[data-head-sub]');
  const stuck = data.organs.filter((o) => o.status === 'red');
  const parts = [];
  if (isNum(d.advanced) && d.advanced > 0) parts.push(`${d.advanced}つ進んだ`);
  if (isNum(d.born) && d.born > 0) parts.push(`${d.born}つ芽が出た`);
  if (isNum(d.died) && d.died > 0) parts.push(`${d.died}つ枯れた`);

  // 一番大事なことを一行で。詰まっているなら、それを先に言う
  if (stuck.length) {
    // 赤は一点。名前を全部赤くすると赤の壁になり、掟が壊れるうえに
    // 「全部壊れている」は行動に繋がらない。先頭の一つだけ名指しする
    el.textContent = '';
    el.append('今日みるべきは、');
    const em = document.createElement('em');
    em.textContent = stuck[0].name;
    el.append(em);
    if (stuck.length > 1) {
      const rest = document.createElement('span');
      rest.className = 'rest';
      rest.textContent = `ほか${stuck.length - 1}件`;
      el.append(rest);
    }
    el.append(' が止まっていること。');
    sub.textContent = parts.length ? `庭のほうは、${parts.join('・')}。` : '庭のほうは、動きなし。';
    return;
  }
  el.textContent = parts.length ? `庭は、${parts.join('・')}。` : '今日は、庭に動きがありません。';
  sub.textContent = d.no_trade
    ? '基準を満たす場面が来なかった日です。何もしなかったことが、約束を守った証拠です。'
    : '設備はすべて灯っています。';
}

function paintDelta(data) {
  const d = data.daily_delta;
  for (const el of document.querySelectorAll('[data-d]')) {
    const v = d[el.dataset.d];
    if (isNum(v)) {
      el.textContent = String(v);
    }
  }
  const mon = document.querySelector('[data-total-monument]');
  if (mon) mon.textContent = String(data.hypotheses.filter((h) => h.stage === 'monument').length);
}

function paintTenki(data) {
  const el = document.querySelector('[data-tenki]');
  const wet = Boolean(data.daily_delta.no_trade);
  el.querySelector('b').textContent = wet ? '雨' : '晴';
  el.querySelector('span').textContent = wet ? '待つ日' : '判定が届いた日';
}

/* ---- 一覧。密度優先・今日動いたものに印 ---- */
function paintList(data) {
  const host = document.querySelector('[data-list]');
  const today = (data.generated_at || '').slice(0, 10);
  host.textContent = '';
  const order = [...data.hypotheses].sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage));
  for (const h of order) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.stage = h.stage;
    row.dataset.state = h.state || 'gray';
    // v2は全遷移時刻を保証する。壊れた日時だけは表示しない。
    if (typeof h.last_change === 'string' && h.last_change.slice(0, 10) === today) row.dataset.moved = '1';

    const st = document.createElement('span');
    st.className = 'stage';
    st.appendChild(document.createElement('i'));
    st.append(STAGE_JA[h.stage] || h.stage);

    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = h.label_public ?? '';
    if (h.epitaph) { const e = document.createElement('span'); e.className = 'epi'; e.textContent = h.epitaph; nm.appendChild(e); }
    if (h.blocker_public) { const f = document.createElement('span'); f.className = 'fuda'; f.textContent = h.blocker_public; nm.appendChild(f); }

    const ck = document.createElement('span');
    ck.className = 'clock';
    if (h.clock && isNum(h.clock.n) && isNum(h.clock.target) && h.clock.target > 0) {
      ck.append(`${h.clock.n} / ${h.clock.target}`);
      const bar = document.createElement('span'); bar.className = 'bar';
      const fi = document.createElement('i');
      fi.style.width = Math.min(100, (h.clock.n / h.clock.target) * 100) + '%';
      bar.appendChild(fi); ck.appendChild(bar);
    } else {
      const n = document.createElement('span'); n.className = 'none';
      n.textContent = h.stage === 'monument' ? '—' : '時計はまだ';
      ck.appendChild(n);
    }
    row.append(st, nm, ck);
    host.appendChild(row);
  }
  const c = document.querySelector('[data-count]');
  if (c) c.textContent = `${data.hypotheses.length}件`;
}

function paintOrgans(data) {
  const host = document.querySelector('[data-organs]');
  host.textContent = '';
  for (const o of data.organs) {
    const el = document.createElement('div');
    el.className = 'organ';
    el.dataset.status = o.status || 'gray';
    const dot = document.createElement('span'); dot.className = 'dot';
    const b = document.createElement('b'); b.textContent = o.name || '';
    const k = document.createElement('span'); k.className = 'k'; k.textContent = String(o.kind || '').toUpperCase();
    const t = document.createElement('span'); t.className = 't';
    const d = o.last_ok ? new Date(o.last_ok) : null;
    t.textContent = d && !Number.isNaN(d.getTime())
      ? `${STATUS_JA[o.status] || ''}　${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`
      : (STATUS_JA[o.status] || '—');
    el.append(dot, b, k, t);
    host.appendChild(el);
  }
}

/* ---- 昨日→今日。最小の差分を一行で ----
   勾配はここに宿る。日が変わっていない/記録が1日しかない時は、
   数字を作らずその旨を書く */
function paintKinou(data) {
  const el = document.querySelector('[data-kinou]');
  if (!el) return;
  const { rows } = getHistory(data);
  el.textContent = '';
  if (rows.length < 2) {
    const s = document.createElement('span');
    s.className = 'flat';
    s.textContent = '昨日の記録がまだありません。明日また開けば、ここに一日ぶんの差が出ます。';
    el.appendChild(s);
    return;
  }
  const today = rows[rows.length - 1], prev = rows[rows.length - 2];
  const parts = [];
  for (const s of ORDER) {
    const d = (today.stages?.[s] || 0) - (prev.stages?.[s] || 0);
    if (d !== 0) parts.push({ s, d });
  }
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = `${prev.date} → 今日`;
  el.appendChild(lbl);
  if (!parts.length) {
    const s = document.createElement('span');
    s.className = 'flat';
    s.textContent = '庭の頭数は、昨日から変わっていません。';
    el.appendChild(s);
    return;
  }
  for (const p of parts) {
    const it = document.createElement('span');
    it.className = 'it';
    const b = document.createElement('b');
    b.textContent = (p.d > 0 ? '+' : '') + p.d;
    const sm = document.createElement('small');
    sm.textContent = STAGE_JA[p.s];
    it.append(b, sm);
    el.appendChild(it);
  }
}

/* ---- タイムラプス ---- */
function setupTimelapse(data, garden) {
  const box = document.querySelector('[data-lapse]');
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
  slider.value = String(rows.length - 1); slider.disabled = false;

  const today = rows[rows.length - 1];
  const render = () => {
    const i = Number(slider.value);
    const row = rows[i];
    const isToday = i === rows.length - 1;
    label.textContent = isToday ? `今日（${row.date}）` : row.date;
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
    diff.textContent = '';
    if (isToday) { diff.append('いまの庭'); return; }
    const parts = [];
    for (const s of STAGES) {
      const d = (today.stages?.[s] || 0) - (row.stages?.[s] || 0);
      if (d !== 0) parts.push({ s, d });
    }
    if (!parts.length) { diff.append('この日から、姿は変わっていません'); return; }
    diff.append('この日から　');
    for (const p of parts) {
      const el = document.createElement('span'); el.className = 'lapse-item';
      const n = document.createElement('b'); n.textContent = (p.d > 0 ? '+' : '') + p.d;
      const s = document.createElement('small'); s.textContent = STAGE_JA[p.s];
      el.append(n, s); diff.appendChild(el);
    }
  };
  slider.addEventListener('input', render);
  render();
}

/* ---- 起動 ---- */
load().then((data) => {
  if (!data) {
    document.querySelector('[data-head]').textContent = '庭の台帳が読めません。';
    document.querySelector('[data-head-sub]').textContent =
      'ecosystem.json が届いていないか、契約の版数が変わっています。数字は出しません。';
    document.querySelector('.garden')?.remove();
    document.querySelector('[data-lapse]')?.remove();
    return;
  }
  recordToday(data);
  const w = document.querySelector('[data-when]');
  const t = data.generated_at ? new Date(data.generated_at) : null;
  if (w && t && !Number.isNaN(t.getTime())) {
    w.textContent = `台帳 ${t.getFullYear()}.${z(t.getMonth() + 1)}.${z(t.getDate())} ${z(t.getHours())}:${z(t.getMinutes())}`;
  }
  paintHead(data); paintKinou(data); paintDelta(data); paintTenki(data);
  paintList(data); paintOrgans(data);
  const cv = document.getElementById('niwa');
  if (cv) {
    const garden = createGarden(cv, { dense: true });
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
