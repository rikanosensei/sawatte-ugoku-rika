# 俺の理科教材

中学理科の授業で使うシミュレーション教材のサイト。素の HTML・CSS・JavaScript だけで作っていて、ビルドもフレームワークもない。ブラウザ（主に学校のタブレットの Chrome / Edge）で開けばそのまま動く。

## ページの構成

```
index.html            トップ（全部の教材を学年ごとにカードで並べる）
└ grade{1,2,3}.html   学年（物理・化学・生物・地学の順に教材カード。ない分野は「準備中」）
  └ {教材}.html       教材本体  例：mirror.html, digestion.html, fall.html
style.css             全ページ共通のデザイン（ここ以外に CSS を書かない）
tests/                Playwright のテスト
```

- 分野のクラス名：`field-physics` / `field-chemistry` / `field-biology` / `field-earth`（色をまとめて切り替える）
- アプリバー・学年ナビ・フッターは各ページにコピーしてある。1か所変えたら全ページそろえる
- 学年ナビ（`nav.tabbar`、名前は「学年」）は、パソコンでは上のバーの右、スマホ（767px 以下）では画面の下に固定。いまの学年に `aria-current`（学年ページは `"page"`、教材ページは `"true"`）
- アプリバーの「もどる」：教材 → 学年、学年 → ホーム。`aria-label` は「中学N年の教材にもどる」「ホームにもどる」
- パンくずはパソコンだけに出す（スマホは「もどる」があるので隠す）

## 教材を追加するとき（`/new-material` スキルがある）

1. 教材ページを作る（骨組み：アプリバー → パンくず → page-head（分野と学年のチップ・題名・lead）→ sim-layout（`.card.sim-stage` にキャンバスとガイドのふきだし、`.card.panel` に操作）→ `.info` のアコーディオン「使い方」（開いておく）「このモデルについて」）
2. 学年ページの、その分野の `.field-section` に教材カード（`.m-card`）を足す。「準備中」の `<p class="empty">` があれば置きかえる。lead の「いまはN本」も直す
3. `index.html` の、その学年の `.card-list` にも同じカードを足す
4. カードの絵（`.m-icon` の中の 40×40 の SVG）は、教材の中身が分かる簡単な線画を `currentColor` で描く
5. `tests/pages.spec.ts` の `PAGES` と「トップには全部の教材が並ぶ」の数を直し、`tests/materials.spec.ts` に教材の動きのテストを足す

## デザインのルール（style.css の先頭にトークンがある）

参考にしたもの：デジタル庁デザインシステム（文字・色・フォーカス・ボタン）、PayPay ミニアプリのガイド（上のバーと下のナビ）、LINE Design System（大事な操作を先に・左右16px・話しかける言葉）

- 色・文字サイズ・余白・角丸は必ず `:root` のトークン（`--color-*`, `--text-*`, `--space-*`, `--radius-*`）を使う。新しい値を直接書かない
- 書体は Noto Sans JP（ロゴだけ毛筆の Yuji Syuku）。本文は 16px・行の高さ 1.7。**14px より小さい文字は使わない**
- 文字は背景とコントラスト比 4.5:1 以上、部品の枠や線は 3:1 以上
- 画面の地は灰色（`--color-bg`）、中身は白いカード（`.card`、角丸 16px）。画面の左右の余白は 16px（パソコンは 24px）
- フォーカス枠は黄と黒の二重（`:focus-visible`）。どの部品でも同じで、消さない
- 押せる部品は 44px 以上（ボタンは 48px）
- ボタンは重要度で3段階：塗り `.btn-primary`（1画面に1つ）→ 枠線 `.btn-secondary`（同じ場所に3つまで）→ テキスト `.btn-tertiary`（もとに戻す・消すなど）。選ぶ操作は `.btn-choice` ＋ `aria-pressed`
- ボタンの文字は「〜をかく」「〜を保存する」のように、押すと何が起こるかを書く
- 分野の色は、チップ・カードの絵・分野の見出しの丸だけに使う
- 説明が長いところは `<details class="accordion">` にたたむ。大事な操作（キャンバスと操作パネル）を先に見せる
- 動きは操作への反応だけ（150ms）。`prefers-reduced-motion` を守る

## 教材の JavaScript

- `<script>` はページの中にそのまま書く（外部ファイルやライブラリは使わない）
- コメントは中学生が読んでも分かる日本語で書く（例：「速さは、重力加速度 × 時間 だけ増える」）
- 画面上の文章は中学生向けの言葉で、話しかけるように書く（「〜しよう」「〜してみよう」）。結果はガイドのふきだし（`.guide` の中の `aria-live="polite"` の `.notice`）に出す
- キャンバスの文字の書体は `'"Noto Sans JP", sans-serif'`（ページで読み込んでいる書体と同じにする）
- キャンバスには `role="img"` と、図の内容を説明する `aria-label` を付ける
- **キャンバスの文字はフォントが読み込まれる前に描かれてしまう。** 最初に一度描いてから、`document.fonts.load('<font>', '<使う文字>')` の後にもう一度描く（`document.fonts.ready` だけでは足りない）
- 指・マウス・ペンは Pointer Events でまとめて扱う。キャンバスが縮んでも座標がずれないように、表示の大きさから換算する
- キャンバスは高解像度の画面でくっきり見えるように、画素を `devicePixelRatio`（最大2）倍にする。図は `W` × `H`（HTML に書いた width / height）を基準に描き、`canvas.width` は使わない。基準の大きさは `data-w` / `data-h` に入れておく（テストが座標の換算に使う）
- ボタンは押せない状態（`disabled`）にしない。「もとに戻す」「消す」をまだ何もないときに押したら、何をすればよいかをふきだしで伝える（デジタル庁のガイドより）
- 動く演出は `prefers-reduced-motion` のときは止めて、結果だけを見せる
- 物理の計算は、コマの長さに左右されないようにする（例：落下では床に当たる瞬間を式で求める）

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
