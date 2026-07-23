#!/usr/bin/env python3
"""ecosystem.json を index.html の静的フォールバックへ焼き込む。

なぜ要るか: DESIGN.md §7「本文をJSの人質にしない」。JSが死んでも一覧が
読めなければならない。だが一覧の中身は契約から来るので、誰かが焼く必要がある。
これは表現面の道具であって、データ生成ではない（台帳には触らない）。

使い方: python3 bake.py    （garden/ で実行。日次で回すなら生成後に叩く）
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE_JA = {"seed": "種", "sprout": "発芽", "sapling": "苗",
            "young_tree": "若木", "tree": "樹・実弾", "monument": "石碑"}
STAGE_ORDER = ["tree", "young_tree", "sapling", "sprout", "seed", "monument"]
ORGAN = {
    "lake": "データを汲む。涸れれば、庭の全部が止まります。",
    "observer": "庭の外を見張る。世界の側の変化を、先に知るための灯です。",
    "market": "眠らない系。日本株が閉じた夜も、ここだけは灯りが見えます。",
    "vault": "檻。約束の外へ出られないように、庭を囲っています。",
}
STATUS_JA = {"green": "灯っている", "yellow": "確認が要る", "red": "止まっている", "gray": "休んでいる"}
E = lambda s: html.escape(str(s), quote=True)


def rows(hyp: list[dict]) -> str:
    out = []
    for h in sorted(hyp, key=lambda x: STAGE_ORDER.index(x["stage"])):
        c = h.get("clock") or {}
        n, t = c.get("n"), c.get("target")
        if isinstance(n, int) and isinstance(t, int) and t > 0:
            pct = min(100, n / t * 100)
            clock = f'{n} / {t}<span class="bar"><i style="width:{pct:.0f}%"></i></span>'
        else:
            none = "—" if h["stage"] == "monument" else "時計はまだ回っていない"
            clock = f'<span class="none">{none}</span>'
        name = E(h.get("label_public") or "")
        if h.get("epitaph"):
            name += f'<span class="epi">{E(h["epitaph"])}</span>'
        if h.get("blocker_public"):
            name += f'<span class="fuda">{E(h["blocker_public"])}</span>'
        out.append(
            f'      <article class="row" data-stage="{E(h["stage"])}" data-state="{E(h.get("state") or "gray")}">\n'
            f'        <span class="stage"><i></i>{STAGE_JA[h["stage"]]}</span>\n'
            f'        <span class="name">{name}</span>\n'
            f'        <span class="clock">{clock}</span>\n'
            f'      </article>'
        )
    return "\n".join(out)


def organs(orgs: list[dict]) -> str:
    out = []
    for o in orgs:
        t = str(o.get("last_ok") or "")
        when = f"{t[5:7]}.{t[8:10]} {t[11:16]}" if len(t) >= 16 else "—"
        st = STATUS_JA.get(o.get("status"), o.get("status") or "—")
        out.append(
            f'      <div class="organ" data-status="{E(o.get("status") or "gray")}">'
            f'<span class="kind">{E(str(o.get("kind","")).upper())}</span>'
            f'<b>{E(o.get("name") or "")}</b>\n'
            f'        <p>{ORGAN.get(o.get("kind"), "")}</p>'
            f'<span class="st">{st}　最終確認 {when}</span></div>'
        )
    return "\n".join(out)


def graves(hyp: list[dict]) -> str:
    """裂け目ページの本文。JSが死んでも死因が読めなければならない"""
    out = []
    mon = [h for h in hyp if h["stage"] == "monument"]
    for i, h in enumerate(mon, 1):
        born = str(h.get("born_on") or "")
        born_text = f"{born[0:4]}.{born[5:7]}.{born[8:10]}" if len(born) >= 10 else "記録されていません"
        rows = [f'        <dt>植えた日</dt><dd class="when">{born_text}</dd>']
        if h.get("epitaph"):
            rows.append(f'        <dt>死因</dt><dd>{E(h["epitaph"])}</dd>')
        lc = str(h.get("last_change") or "")
        when = f'{lc[0:4]}.{lc[5:7]}.{lc[8:10]}' if len(lc) >= 10 and lc[0:4].isdigit() else None
        rows.append(f'        <dt>終わった日</dt><dd class="when">{when}</dd>' if when
                    else '        <dt>終わった日</dt><dd class="gap">記録されていません</dd>')
        out.append(
            f'      <article class="grave">\n'
            f'        <div class="zu"><canvas></canvas></div>\n'
            f'        <div>\n'
            f'          <p class="no">{i:02d}</p>\n'
            f'          <h2>{E(h.get("label_public") or "")}</h2>\n'
            f'          <dl>\n' + "\n".join(rows) + '\n          </dl>\n'
            f'          <span class="fin">終端 — 埋めない</span>\n'
            f'        </div>\n'
            f'      </article>'
        )
    return "\n".join(out)


def swap(src: str, marker: str, body: str) -> str:
    pat = re.compile(
        rf"(<!-- BAKE:{marker}:START -->).*?(<!-- BAKE:{marker}:END -->)", re.S)
    if not pat.search(src):
        raise SystemExit(f"marker BAKE:{marker} が index.html に無い")
    return pat.sub(lambda m: f"{m.group(1)}\n{body}\n{m.group(2)}", src)


def main() -> int:
    eco = json.loads((HERE / "ecosystem.json").read_text(encoding="utf-8"))
    if eco.get("schema") != "ecosystem_v2":
        raise SystemExit(f"未知の契約: {eco.get('schema')}。焼かずに止める")
    src = (HERE / "index.html").read_text(encoding="utf-8")
    src = swap(src, "LIST", rows(eco["hypotheses"]))
    src = swap(src, "ORGANS", organs(eco["organs"]))
    d = eco["daily_delta"]
    for k in ("advanced", "born", "died", "blocked"):
        src = re.sub(rf'(<b data-d="{k}">)[^<]*(</b>)', rf'\g<1>{d.get(k, 0)}\g<2>', src)
    (HERE / "index.html").write_text(src, encoding="utf-8")

    # 裂け目ページ
    g = (HERE / "graves.html").read_text(encoding="utf-8")
    mon = [h for h in eco["hypotheses"] if h["stage"] == "monument"]
    g = swap(g, "GRAVES", graves(eco["hypotheses"]))
    g = re.sub(r'(<b data-f="count">)[^<]*(</b>)', rf'\g<1>{len(mon)}\g<2>', g)
    (HERE / "graves.html").write_text(g, encoding="utf-8")

    print(json.dumps({"baked": {"hypotheses": len(eco["hypotheses"]), "organs": len(eco["organs"]),
                                "graves": len(mon)},
                      "generated_at": eco.get("generated_at")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
