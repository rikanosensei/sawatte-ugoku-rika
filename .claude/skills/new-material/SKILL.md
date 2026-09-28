---
name: new-material
description: 俺の理科教材に新しいシミュレーション教材を1本追加する。教材ページを作り、分野ページ・学年ページ・トップの件数とテストまでまとめて更新する。
argument-hint: <学年> <分野> <単元名>  例：中2 物理 オームの法則
disable-model-invocation: true
---

# 新しい教材を追加する

引数：`$ARGUMENTS`（学年・分野・単元名。足りなければ最初に聞く）

## 0. 決める

- 学年 N（1〜3）、分野（物理 physics / 化学 chemistry / 生物 biology / 地学 earth）、単元名
- ファイル名：単元を表す短い英語（例：`ohm.html`, `lens.html`）。既存のファイル名とぶつからないこと
- 英語の題名（`.en` に入れる。例：Ohm's Law）
- 何を動かして、何を確かめる教材か。学習指導要領の範囲で、中学生が「動かして分かる」ものにする。作り始める前に、操作と見せるものを3行ほどで提案して、ユーザーの了承をとる

## 1. 教材ページを作る

[templates/material.html](templates/material.html) をコピーして `{{...}}` を埋める。

- 骨組み（パンくず → page-header → sim-layout → 使い方 → このモデルについて → 戻るボタン）は変えない
- 操作パネルの部品は既存のクラスを使う：スライダーは `.control`、ボタンは `.btn`（主ボタンは1つだけ）、選ぶ操作は `.btn-choice` ＋ `aria-pressed`
- キャンバスの色は既存の教材に合わせる（方眼 `#e3ecf6` / `#c9d9ea`、文字 `#1a2533`、線 `#7f93a8`）
- JavaScript のコメントは中学生にも読める日本語で
- キャンバスの文字は、テンプレートの最後にあるとおり `document.fonts.load` の後に描き直す
- 「このモデルについて」には、単純にしたところと、実際との違いを正直に書く

## 2. 分野ページ

- `grade{N}-{field}.html` があれば `.material-list` に1行足す
- なければ `grade1-physics.html` をまねて作る（パンくず・題名・戻るボタンの文言を学年と分野に合わせる）

## 3. 学年ページとトップ

- `grade{N}.html`：その分野のタイルが `<div class="tile is-disabled">…準備中` なら `<a class="tile tile-{field}" href="grade{N}-{field}.html">` にして `教材 1件` に。すでにリンクなら件数を1つ増やす
- `index.html`：学年タイルの `教材 N件` を、その学年の教材の合計に直す

## 4. テスト

- `tests/pages.spec.ts` の `PAGES` に、新しい教材ページ（と、新しく作ったなら分野ページ）を足す
- `tests/materials.spec.ts` に `test.describe('<単元名>', ...)` を足す。最低限：
  - スライダーやボタンで表示の数値・メッセージが変わる
  - 操作するとキャンバスの絵が変わる（`canvasImage` で比べる）
  - もとに戻す操作があれば、最初の絵に戻る
- `npm test` を実行して、全部通ることを確かめる

## 5. 確かめて報告

- `.claude/launch.json` の `site` で画面を開き、パソコン幅とスマホ幅（375px）で見た目と操作を確かめる。横スクロールが出ないこと
- material-reviewer サブエージェントに、理科の内容・言葉・使いやすさを見てもらい、指摘を直す
- 変えたファイルと、テストの結果をユーザーに伝える
