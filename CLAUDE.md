# 俺の理科教材

中学理科の授業で使うシミュレーション教材のサイト。素の HTML・CSS・JavaScript だけで作っていて、ビルドもフレームワークもない。ブラウザ（主に学校のタブレットの Chrome / Edge）で開けばそのまま動く。

## ページの構成

```
index.html                     トップ（学年を選ぶ）
└ grade{1,2,3}.html            学年（分野を選ぶ：物理・化学・生物・地学）
  └ grade{N}-{field}.html      分野（教材一覧）  例：grade2-biology.html
    └ {教材}.html              教材本体          例：mirror.html, digestion.html, fall.html
style.css                      全ページ共通のデザイン（ここ以外に CSS を書かない）
tests/                         Playwright のテスト
```

- 分野のファイル名：physics / chemistry / biology / earth
- ヘッダー・パンくず・フッターは各ページにコピーしてある。1か所変えたら全ページそろえる。

## 教材を追加するとき（`/new-material` スキルがある）

1. 教材ページを作る（既存の教材と同じ骨組み：パンくず → page-header → sim-layout（キャンバス＋panel）→ 使い方 → このモデルについて → 戻るボタン）
2. 分野ページの `.material-list` に1行足す。分野ページがなければ作る
3. 学年ページのタイル：準備中の `<div class="tile is-disabled">` を `<a class="tile tile-{field}" href="...">` に変え、「教材 N件」を数える
4. `index.html` の学年タイルの「教材 N件」も直す
5. `tests/pages.spec.ts` の `PAGES` に追加し、`tests/materials.spec.ts` に教材の動きのテストを足す

## デザインのルール（style.css の先頭にトークンがある）

- 色・文字サイズ・余白・角丸は必ず `:root` のトークン（`--color-*`, `--text-*`, `--space-*`, `--radius-*`）を使う。新しい値を直接書かない
- 文字サイズは7段階だけ。余白は 4px / 8px の倍数だけ
- 押せる部品は最小 44px（`--target-min`）。フォーカス枠（`:focus-visible`）を消さない
- 題名・見出しは日本語を大きく、英語は小さく添える（HTML では `.en` → `.ja` の順に書き、CSS で並びを入れ替えている）
- 分野の色：物理＝青 `chip-physics` / 化学＝紫 `chip-chemistry` / 生物＝緑 `chip-biology` / 地学＝茶 `chip-earth`。ラベルとタイルの印だけに使う
- モチーフは理科ノートの方眼。ヒーローとページの頭に敷く。キャンバスの方眼も同じ色（`#e3ecf6` / `#c9d9ea`）
- 主ボタン（`.btn-primary`）は1ページに1つだけ。ほかは `.btn-secondary`、選ぶ操作は `.btn-choice` ＋ `aria-pressed`
- 動きは操作への反応だけ（200ms 以内、`transform` / `opacity`）。`prefers-reduced-motion` を守る

## 教材の JavaScript

- `<script>` はページの中にそのまま書く（外部ファイルやライブラリは使わない）
- コメントは中学生が読んでも分かる日本語で書く（例：「速さは、重力加速度 × 時間 だけ増える」）
- 画面上の文章は中学生向けの言葉で。結果は `aria-live="polite"` の `.notice` に出す
- キャンバスには `role="img"` と、図の内容を説明する `aria-label` を付ける
- **キャンバスの文字はフォントが読み込まれる前に描かれてしまう。** 最初に一度描いてから、`document.fonts.load('<font>', '<使う文字>')` の後にもう一度描く（`document.fonts.ready` だけでは足りない）
- 指・マウス・ペンは Pointer Events でまとめて扱う。キャンバスが縮んでも座標がずれないように、表示の大きさから換算する

## テスト

```bash
npm test          # Chromium のパソコン幅（desktop）とスマホ幅（mobile）
npm run test:ui   # 画面を見ながら
```

- テストのときは http-server が `localhost:4173` で自動で立ち上がる（画面確認用は `.claude/launch.json` の 5173 番）
- `.html` / `.css` を書き換えると、フック（`.claude/hooks/run-tests.js`）が自動でテストを走らせる
- Firefox と WebKit はこのパソコンでは起動できないので使わない

## 公開するとき

アップロードするのは `*.html` と `style.css` だけ。`node_modules/`、`tests/`、`.claude/`、`package*.json` などは上げない。全ページに `noindex` を付けている。
