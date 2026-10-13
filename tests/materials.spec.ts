import { test, expect, type Page } from '@playwright/test';

// キャンバスの今の絵を文字列にして取り出す（絵が変わったかを比べるため）
async function canvasImage(page: Page) {
  return page.locator('#board').evaluate((c: HTMLCanvasElement) => c.toDataURL());
}

// キャンバスの中の座標（内部の大きさ）を、画面上の座標に直す
async function toScreen(page: Page, x: number, y: number) {
  const canvas = page.locator('#board');
  const box = await canvas.boundingBox();
  // 高解像度の画面では画素を細かくしているので、図の基準の大きさ（data-w / data-h）を使う
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: Number(c.dataset.w), h: Number(c.dataset.h) }));
  if (!box) throw new Error('キャンバスが表示されていない');
  return { x: box.x + (x * box.width) / size.w, y: box.y + (y * box.height) / size.h };
}

test.describe('鏡にうつる像と光の反射', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('mirror.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('スライダーで身長と距離の表示が変わり、図が描き直される', async ({ page }) => {
    const before = await canvasImage(page);
    await page.getByLabel('身長').fill('180');
    await expect(page.locator('#hValue')).toHaveText('180');
    await page.getByLabel('鏡からの距離').fill('150');
    await expect(page.locator('#dValue')).toHaveText('150');
    expect(await canvasImage(page)).not.toBe(before);
  });

  test('ボタンで光の道筋をかき、すべて消せる', async ({ page }) => {
    const reset = page.getByRole('button', { name: '線をすべて消す' });
    const msg = page.locator('#msg');
    const before = await canvasImage(page);

    // まだ線がないときに押すと、何をすればよいかが出る
    await reset.click();
    await expect(msg).toContainText('消す線はまだありません');

    await page.getByRole('button', { name: '頭の先からの光' }).click();
    await expect(msg).toContainText('頭の先から出た光');
    await page.getByRole('button', { name: '足もとからの光' }).click();
    await expect(msg).toContainText('両方の光がかけた'); // 頭の先と足もとがそろうとお祝い
    expect(await canvasImage(page)).not.toBe(before);

    await reset.click();
    await expect(msg).toContainText('ドラッグしよう');
    expect(await canvasImage(page)).toBe(before);
  });

  test('頭の先と足もとの光が鏡に当たる点の間は、距離によらず身長の半分', async ({ page }) => {
    for (const [height, distance] of [[160, 50], [160, 100], [160, 200], [120, 80], [190, 150]]) {
      await page.getByLabel('身長').fill(String(height));
      await page.getByLabel('鏡からの距離').fill(String(distance));
      // ページの中の計算（getPositions / targetOf）を使って、光が鏡に当たる高さを求める
      const lengthCm = await page.evaluate(() => {
        const w = window as unknown as {
          getPositions: () => { eyeX: number; eyeY: number };
          targetOf: (p: { part: string }, pos: object) => { x: number; y: number };
        };
        const pos = w.getPositions();
        const hitY = (part: string) => {
          const t = w.targetOf({ part }, pos);
          const k = (480 - pos.eyeX) / (t.x - pos.eyeX);   // 480 は鏡の位置
          return pos.eyeY + k * (t.y - pos.eyeY);
        };
        return (hitY('foot') - hitY('head')) / 2;          // 1cm を 2px で描いている
      });
      expect(lengthCm, `身長${height}cm・距離${distance}cm`).toBeCloseTo(height / 2, 5);
    }
  });

  test('目から像に向かってドラッグすると線が引ける', async ({ page }) => {
    // 初期値（身長160cm・距離100cm）のとき、目はキャンバスの (668, 140) あたり
    const eye = await toScreen(page, 668, 140);
    const target = await toScreen(page, 300, 120);

    await page.mouse.move(eye.x, eye.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('#msg')).toContainText('光の道筋をかいた');
  });

  test('鏡の手前で指を離すと、のばすように案内が出る', async ({ page }) => {
    const eye = await toScreen(page, 668, 140);
    const notFar = await toScreen(page, 560, 140);

    await page.mouse.move(eye.x, eye.y);
    await page.mouse.down();
    await page.mouse.move(notFar.x, notFar.y, { steps: 5 });
    await page.mouse.up();

    await expect(page.locator('#msg')).toContainText('鏡の向こう側');
  });
});

test.describe('消化酵素のはたらき', () => {
  const ENZYMES = [
    { name: 'アミラーゼ', message: 'デンプンを分解した' },
    { name: 'ペプシン', message: 'タンパク質を分解した' },
    { name: 'トリプシン', message: 'タンパク質を分解した' },
    { name: 'リパーゼ', message: '脂肪を分解した' },
    { name: '胆汁', message: '分解はしない' },
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto('digestion.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  for (const { name, message } of ENZYMES) {
    test(`${name}を押すと、選んだ状態になり説明が出る`, async ({ page }) => {
      const button = page.getByRole('button', { name: new RegExp(`^${name}`) });
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#msg')).toContainText(message);
    });
  }

  test('胆汁では図が変わらず、酵素では図が変わる', async ({ page }) => {
    const before = await canvasImage(page);
    await page.getByRole('button', { name: /^胆汁/ }).click();
    await expect.poll(() => canvasImage(page)).toBe(before); // 脂肪は少しゆれるだけで、もとの形にもどる
    await page.getByRole('button', { name: /^リパーゼ/ }).click();
    await expect.poll(() => canvasImage(page)).not.toBe(before); // 粒は少しずつはなれる
  });

  test('3つの栄養素を全部分解すると、お祝いの言葉が出る', async ({ page }) => {
    await page.getByRole('button', { name: /^アミラーゼ/ }).click();
    await page.getByRole('button', { name: /^ペプシン/ }).click();
    await expect(page.locator('#msg')).not.toContainText('全部分解された');
    await page.getByRole('button', { name: /^リパーゼ/ }).click();
    await expect(page.locator('#msg')).toContainText('3つの栄養素が全部分解された');
  });
  test('もとに戻すと、選んだ状態と図が最初に戻る', async ({ page }) => {
    const reset = page.getByRole('button', { name: 'もとに戻す' });
    const before = await canvasImage(page);

    // まだ何も選んでいないときに押すと、何をすればよいかが出る
    await reset.click();
    await expect(page.locator('#msg')).toContainText('まだ何も選んでいません');

    await page.getByRole('button', { name: /^アミラーゼ/ }).click();
    await page.getByRole('button', { name: /^ペプシン/ }).click();
    await reset.click();

    await expect(page.locator('.btn-choice[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#msg')).toHaveText('消化酵素のボタンを押してみよう。');
    expect(await canvasImage(page)).toBe(before);
  });
});

test.describe('落下運動と反発係数', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('fall.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('スライダーで重力の強さと反発係数の表示が変わる', async ({ page }) => {
    await page.getByLabel('重力の強さ').fill('0.2');
    await expect(page.locator('#gValue')).toHaveText('0.2');
    await page.getByLabel('反発係数').fill('0.5');
    await expect(page.locator('#eValue')).toHaveText('0.5');
  });

  test('重力の強さに近い星の名前が出る', async ({ page }) => {
    const hint = page.locator('#gPlanet');
    await expect(hint).toHaveText('地球の重力');
    await page.getByLabel('重力の強さ').fill('0.2');
    await expect(hint).toHaveText('月くらいの重力');
    await page.getByLabel('重力の強さ').fill('2.5');
    await expect(hint).toHaveText('木星くらいの重力');
    await page.getByLabel('重力の強さ').fill('1.6');
    await expect(hint).toHaveText('');
  });
  test('スタートを押すとボールが落ち、時間と高さの表示が変わる', async ({ page }) => {
    const before = await canvasImage(page);
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect.poll(() => canvasImage(page)).not.toBe(before);
    await expect.poll(async () => Number(await page.locator('#timeValue').textContent())).toBeGreaterThan(0);
    await expect.poll(async () => Number(await page.locator('#heightValue').textContent())).toBeLessThan(2.7);
  });

  test('反発係数が0なら、弾まずに止まる', async ({ page }) => {
    await page.getByLabel('重力の強さ').fill('2.5');
    await page.getByLabel('反発係数').fill('0');
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.locator('#msg')).toContainText('弾まずに止まった');
    await expect(page.locator('#bounceValue')).toHaveText('0');
    await expect(page.locator('#heightValue')).toHaveText('0.00');
  });

  test('反発係数が1より小さいと、何回か弾んで止まる', async ({ page }) => {
    await page.getByLabel('重力の強さ').fill('2.5');
    await page.getByLabel('反発係数').fill('0.5');
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.locator('#msg')).toContainText('回弾んだ', { timeout: 10000 });
    expect(Number(await page.locator('#bounceValue').textContent())).toBeGreaterThan(2);
  });

  test('反発係数が1なら、弾んでも最初の高さまでもどる', async ({ page }) => {
    await page.getByLabel('重力の強さ').fill('2.5');
    await page.getByLabel('反発係数').fill('1');
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.locator('#bounceValue')).toHaveText('1');

    // 1回弾んだあと、しばらく高さを見て、いちばん高いところを調べる
    let highest = 0;
    for (let i = 0; i < 40; i++) {
      highest = Math.max(highest, Number(await page.locator('#heightValue').textContent()));
      await page.waitForTimeout(30);
    }
    expect(highest).toBeGreaterThan(2.6);
    expect(highest).toBeLessThanOrEqual(2.7);
  });
});

test.describe('イカの解剖', () => {
  const msg = (page: Page) => page.locator('#msg');
  const tool = (page: Page, name: string) => page.locator('.tool-btn', { hasText: name }).click();
  const record = (page: Page, group: string, name: string) => page.locator(`.check-list li[data-group="${group}"][data-name="${name}"]`);

  // キャンバスの座標（600 × 360 を基準）を、画面の座標に直す。
  // 先にキャンバスを画面のまん中に出す（上のバーにかくれないように）
  async function at(page: Page, x: number, y: number) {
    await page.locator('#board').evaluate((c) => c.scrollIntoView({ block: 'center' }));
    return toScreen(page, x, y);
  }
  async function tap(page: Page, x: number, y: number) {
    const p = await at(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  // 指をおしたまま、点を順にたどる（wait ミリ秒ずつ止まるので、ゆっくり動く）
  async function dragThrough(page: Page, points: number[][], wait = 25) {
    const first = await at(page, points[0][0], points[0][1]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) {
      const p = await toScreen(page, x, y);
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(wait);
    }
    await page.mouse.up();
  }
  const line = (x0: number, x1: number, y: number) => {
    const pts: number[][] = [];
    for (let x = x0; x <= x1; x += 5) pts.push([x, y]);
    return pts;
  };

  // よく使う操作
  async function turnOver(page: Page) {
    await tool(page, '手');
    await tap(page, 360, 180);
    await page.waitForTimeout(600);   // 裏返す動きが終わるまで待つ
  }
  async function cutMantle(page: Page) {
    await tool(page, 'はさみ');
    await dragThrough(page, line(260, 546, 180));
    await expect(msg(page)).toContainText('先端まで切れた');
  }
  async function openMantle(page: Page) {
    await tool(page, 'ピンセット');
    await dragThrough(page, [[380, 176], [380, 150], [380, 120], [380, 95]]);
    await dragThrough(page, [[380, 184], [380, 220], [380, 250], [380, 270]]);
    await expect(msg(page)).toContainText('外とう膜を広げた');
    await page.waitForTimeout(600);
  }
  async function severAndFlip(page: Page) {
    await tool(page, 'はさみ');
    await dragThrough(page, line(290, 454, 218));
    await expect(msg(page)).toContainText('切りはなせた');
    await tool(page, 'ピンセット');
    await dragThrough(page, [[372, 182], [372, 165], [372, 150], [372, 125]]);
    await expect(msg(page)).toContainText('内臓を裏返した');
    await page.waitForTimeout(800);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('squid.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('道具を選ぶと、選んだ状態になって使い方が出る', async ({ page }) => {
    const loupe = page.locator('.tool-btn', { hasText: 'ルーペ' });
    await expect(loupe).toHaveAttribute('aria-pressed', 'false');
    await loupe.click();
    await expect(loupe).toHaveAttribute('aria-pressed', 'true');
    await expect(msg(page)).toContainText('「ルーペ」を持った');
    await tool(page, 'はさみ');
    await expect(loupe).toHaveAttribute('aria-pressed', 'false');
  });

  test('ルーペで外観を見つけると記録に印がつき、手で裏返すと、ろうとも見つかる', async ({ page }) => {
    await tool(page, 'ルーペ');
    for (const [name, x, y] of [['口', 166, 180], ['あし', 96, 162], ['目', 206, 138], ['外とう膜', 360, 152], ['ひれ', 478, 100]] as const) {
      await tap(page, x, y);
      await expect(msg(page)).toContainText(`「${name}」を見つけた`);
      await expect(record(page, 'outside', name)).toHaveClass(/is-found/);
    }
    await expect(msg(page)).toContainText('裏返してみよう');
    await turnOver(page);
    await tool(page, 'ルーペ');
    await tap(page, 246, 180);
    await expect(msg(page)).toContainText('外観の部分を全部見つけた');
    await expect(page.locator('#foundValue')).toHaveText('6');
  });

  test('背中側からは切れず、裏返してゆっくり切ると傷をつけずに切れる', async ({ page }) => {
    await tool(page, 'はさみ');
    await tap(page, 260, 180);
    await expect(msg(page)).toContainText('ろうとのある側から切るよ');
    await turnOver(page);
    await cutMantle(page);
    await expect(msg(page)).toContainText('内臓に傷をつけずに切れた');
    await expect(page.locator('#scratchValue')).toHaveText('0');
  });

  test('はさみを速く動かすと、内臓に傷がつく', async ({ page }) => {
    await turnOver(page);
    await tool(page, 'はさみ');
    await dragThrough(page, [[260, 180], [300, 180], [380, 180], [460, 180]], 5);
    await expect(msg(page)).toContainText('内臓に傷をつけてしまった');
    await expect(page.locator('#scratchValue')).not.toHaveText('0');
  });

  test('切ってから切り口を広げると、内臓の名前が見つかる', async ({ page }) => {
    await turnOver(page);
    await cutMantle(page);
    await openMantle(page);
    const organs = [['肛門', 270, 181], ['心臓', 421, 148], ['胃', 472, 182], ['墨袋', 342, 167], ['腸', 380, 196], ['肝臓', 330, 184], ['えら', 330, 118]] as const;
    for (const [name, x, y] of organs) {
      await tap(page, x, y);
      await expect(msg(page)).toContainText(`「${name}」を見つけた`);
      await expect(record(page, 'organ', name)).toHaveClass(/is-found/);
    }
    await expect(msg(page)).toContainText('内臓を全部見つけた');
  });

  test('内臓を切りはなして裏返し、スポイトで赤インクを入れると肛門から出る', async ({ page }) => {
    await turnOver(page);
    await cutMantle(page);
    await openMantle(page);

    // 裏返す前に口へ入れようとすると、先に食道を見えるようにするよう伝える
    await tool(page, 'スポイト');
    await tap(page, 166, 180);
    await expect(msg(page)).toContainText('食道が見えるようにしてから');

    await severAndFlip(page);
    await tool(page, 'スポイト');
    const suck = async () => {
      await tap(page, 558, 52);
      await expect(msg(page)).toContainText('スポイトに赤インクを吸った');
    };
    const mouth = await at(page, 166, 180);
    await suck();
    await page.mouse.move(mouth.x, mouth.y);
    await page.mouse.down();
    await expect(page.locator('#inkValue')).toHaveText('食道');
    await expect(msg(page)).toContainText('スポイトの赤インクがなくなった', { timeout: 8000 });
    await page.mouse.up();

    await suck();
    await page.mouse.move(mouth.x, mouth.y);
    await page.mouse.down();
    await expect(msg(page)).toContainText('肛門から出てきた', { timeout: 8000 });
    await page.mouse.up();
    await expect(page.locator('#inkValue')).toHaveText('肛門');
    await expect(record(page, 'tract', '食道')).toHaveClass(/is-found/);
    await expect(record(page, 'tract', '肛門')).toHaveClass(/is-found/);
  });

  test('ヒントは、いまの状態に合わせて変わる', async ({ page }) => {
    const hint = page.getByRole('button', { name: 'ヒントを見る' });
    await hint.click();
    await expect(msg(page)).toContainText('「ルーペ」でイカの上をなぞって');
    await tool(page, 'ルーペ');
    for (const [x, y] of [[166, 180], [96, 162], [206, 138], [360, 152], [478, 100]]) await tap(page, x, y);
    await hint.click();
    await expect(msg(page)).toContainText('「手」でイカを裏返すと');
    await turnOver(page);
    await tool(page, 'ルーペ');
    await tap(page, 246, 180);
    await hint.click();
    await expect(msg(page)).toContainText('「はさみ」を持って');
  });

  test('最初からやり直すと、記録と図が最初にもどる', async ({ page }) => {
    const before = await canvasImage(page);
    const reset = page.getByRole('button', { name: '最初からやり直す' });
    await reset.click();
    await expect(msg(page)).toContainText('まだ何もしていない');

    await tool(page, 'ルーペ');
    await tap(page, 166, 180);
    await turnOver(page);
    await tool(page, 'はさみ');
    await dragThrough(page, line(260, 330, 180));
    await reset.click();

    await expect(page.locator('#foundValue')).toHaveText('0');
    await expect(page.locator('.check-list li.is-found')).toHaveCount(0);
    await expect(msg(page)).toContainText('自由に観察・解剖してみよう');
    // 道具を持っていると図の上に道具が描かれるので、指を図の外に出してからくらべる
    await page.mouse.move(0, 0);
    await page.locator('#board').dispatchEvent('pointerleave', { pointerType: 'mouse' });
    expect(await canvasImage(page)).toBe(before);
  });
});

test.describe('栄養分の吸収', () => {
  const msg = (page: Page) => page.locator('#msg');

  // 粒をつまんで、(tx, ty) まで運んで指をはなす（座標は 600 × 360 を基準）
  async function carry(page: Page, x: number, y: number, tx: number, ty: number) {
    await page.locator('#board').scrollIntoViewIfNeeded();
    const from = await toScreen(page, x, y);
    const to = await toScreen(page, tx, ty);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }

  // ①の黄色でかこんだ柔毛をタップして、②へ
  async function zoomIn(page: Page) {
    await page.locator('#board').scrollIntoViewIfNeeded();
    const p = await toScreen(page, 300, 152);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByRole('button', { name: /^② 柔毛の中/ })).toHaveAttribute('aria-pressed', 'true');
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('villus.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('①かべの表面の長さをくらべると、倍率が出て図が変わる', async ({ page }) => {
    const before = await canvasImage(page);
    await page.getByRole('button', { name: 'かべの表面の長さをくらべる' }).click();
    await expect(msg(page)).toContainText(/平らなときの約\d+倍/);
    expect(await canvasImage(page)).not.toBe(before);
    await page.getByRole('button', { name: 'くらべる線を消す' }).click();
    expect(await canvasImage(page)).toBe(before);
  });

  test('柔毛をタップすると、大きくして柔毛の中を見られる', async ({ page }) => {
    await zoomIn(page);
    await expect(msg(page)).toContainText('どちらの管に入るか予想して運ぼう');
  });

  test('ブドウ糖をリンパ管に入れるとはね返り、毛細血管に入れると吸収される', async ({ page }) => {
    await zoomIn(page);
    await carry(page, 72, 82, 300, 230);
    await expect(msg(page)).toContainText('リンパ管には入らないみたい');
    await expect(page.locator('#leftValue')).toHaveText('9');

    await page.waitForTimeout(800);        // はね返った粒が、もとの場所にもどるまで待つ
    await carry(page, 72, 82, 250, 220);
    await expect(msg(page)).toContainText('「ブドウ糖」が毛細血管に入った');
    await expect(page.locator('#bloodValue')).toHaveText('1');
    await expect(page.locator('#leftValue')).toHaveText('8');
  });

  test('脂肪酸を毛細血管に入れるとはね返る', async ({ page }) => {
    await zoomIn(page);
    await carry(page, 158, 184, 250, 220);
    await expect(msg(page)).toContainText('毛細血管には入らないみたい');
  });

  test('脂肪酸2つとモノグリセリドをリンパ管に入れると、再び脂肪になる', async ({ page }) => {
    await zoomIn(page);
    await carry(page, 158, 184, 300, 230);
    await expect(msg(page)).toContainText('「脂肪酸」が柔毛の中に入った');
    await carry(page, 452, 176, 300, 230);
    await carry(page, 528, 198, 300, 230);
    await expect(msg(page)).toContainText('再び脂肪になって、リンパ管に入った');
    await expect(page.locator('#lymphValue')).toHaveText('3');
  });

  test('5種類を全部運ぶとお祝いが出て、もとに戻すと最初にもどる', async ({ page }) => {
    const before = await canvasImage(page);
    const reset = page.getByRole('button', { name: 'もとに戻す' });
    await reset.click();
    await expect(msg(page)).toContainText('まだ何もしていない');

    await page.getByRole('button', { name: /^② 柔毛の中/ }).click();
    const help = page.getByRole('button', { name: '1つ運んでもらう' });
    for (let i = 0; i < 9; i++) await help.click();
    await expect(msg(page)).toContainText('5種類の栄養分を全部吸収できた');
    await expect(page.locator('#bloodValue')).toHaveText('6');
    await expect(page.locator('#lymphValue')).toHaveText('3');
    await expect(page.locator('#leftValue')).toHaveText('0');

    await reset.click();
    await expect(page.getByRole('button', { name: /^① 小腸のかべ/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#leftValue')).toHaveText('9');
    expect(await canvasImage(page)).toBe(before);
  });
});

test.describe('ニュートンばねばかり', () => {
  const msg = (page: Page) => page.locator('#msg');
  const press = (page: Page, name: string) => page.getByRole('button', { name }).click();

  test.beforeEach(async ({ page }) => {
    await page.goto('newton.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('おもりをつるすと、おもりの重さとばねののびが変わる', async ({ page }) => {
    const before = await canvasImage(page);
    await press(page, '100gのおもりをつるす');
    await press(page, '50gのおもりをつるす');
    await expect(page.locator('#massValue')).toHaveText('150');
    await expect(page.locator('#stretchValue')).toHaveText('3.0');   // 1N で 2cm のびる
    await expect(msg(page)).toContainText('何Nかな');
    await expect.poll(() => canvasImage(page)).not.toBe(before);

    await press(page, 'おもりを1つはずす');
    await expect(page.locator('#massValue')).toHaveText('100');
    await expect(page.locator('#stretchValue')).toHaveText('2.0');
  });

  test('5Nをこえるおもりは、つるせない', async ({ page }) => {
    for (let i = 0; i < 5; i++) await press(page, '100gのおもりをつるす');
    await press(page, '50gのおもりをつるす');
    await expect(msg(page)).toContainText('5Nまでしかはかれない');
    await expect(page.locator('#massValue')).toHaveText('500');
  });

  test('記録をふやすと、点が直線の上にならぶことが分かる', async ({ page }) => {
    await press(page, '表とグラフに記録する');
    await expect(msg(page)).toContainText('まだおもりをつるしていない');

    await press(page, '100gのおもりをつるす');
    await press(page, '表とグラフに記録する');
    await expect(msg(page)).toContainText('1Nのとき、ばねののびは2.0cm');
    await press(page, '表とグラフに記録する');
    await expect(msg(page)).toContainText('もう記録してある');

    for (const g of ['50g', '100g', '100g']) {
      await press(page, `${g}のおもりをつるす`);
      await press(page, '表とグラフに記録する');
    }
    await expect(page.locator('#countValue')).toHaveText('4');
    await expect(msg(page)).toContainText('原点を通る1本の直線');
  });

  test('はずすおもりがないときは、何をすればよいかが出る', async ({ page }) => {
    await press(page, 'おもりを1つはずす');
    await expect(msg(page)).toContainText('はずすおもりは、まだない');
  });

  test('手で引っぱると、ばねがのび、はなすともとにもどる', async ({ page }) => {
    await page.getByRole('button', { name: /^手で引っぱる/ }).click();
    await expect(page.getByRole('button', { name: /^手で引っぱる/ })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#board').evaluate((c) => c.scrollIntoView({ block: 'center' }));
    const hook = await toScreen(page, 110, 212);   // フックのいちばん下
    const down = await toScreen(page, 110, 264);
    await page.mouse.move(hook.x, hook.y);
    await page.mouse.down();
    await page.mouse.move(down.x, down.y, { steps: 6 });
    await expect(page.locator('#stretchValue')).toHaveText('4.0');   // 52px 引く ＝ 2N ＝ 4cm
    await page.mouse.up();
    await expect(msg(page)).toContainText('およそ2Nの力で引いていた');
    await expect(page.locator('#stretchValue')).toHaveText('0.0');
  });

  test('最初からやり直すと、記録とおもりが消えて図も最初にもどる', async ({ page }) => {
    const before = await canvasImage(page);
    await press(page, '最初からやり直す');
    await expect(msg(page)).toContainText('まだ何もしていない');
    await press(page, '100gのおもりをつるす');
    await press(page, '表とグラフに記録する');
    await press(page, '最初からやり直す');
    await expect(page.locator('#countValue')).toHaveText('0');
    await expect(page.locator('#massValue')).toHaveText('0');
    expect(await canvasImage(page)).toBe(before);
  });
});

test.describe('不要な物質のゆくえ', () => {
  const msg = (page: Page) => page.locator('#msg');

  // 粒をつまんで、(tx, ty) まで運んで指をはなす（座標は 600 × 400 を基準）
  async function carry(page: Page, x: number, y: number, tx: number, ty: number) {
    await page.locator('#board').evaluate((c) => c.scrollIntoView({ block: 'center' }));
    const from = await toScreen(page, x, y);
    const to = await toScreen(page, tx, ty);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  const LIVER = [180, 150], KIDNEY = [175, 212], GLAND = [309, 206], BLADDER = [210, 298];

  test.beforeEach(async ({ page }) => {
    await page.goto('excrete.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('アンモニアをいきなり腎臓に運ぶと、はね返ってヒントが出る', async ({ page }) => {
    await carry(page, 440, 78, KIDNEY[0], KIDNEY[1]);
    await expect(msg(page)).toContainText('アンモニアのままでは、体に有害');
    await expect(page.locator('#ureaValue')).toHaveText('0');
  });

  test('肝臓で尿素になり、腎臓で尿になって、ぼうこうから体外に出せる', async ({ page }) => {
    const before = await canvasImage(page);
    await carry(page, 440, 78, LIVER[0], LIVER[1]);
    await expect(msg(page)).toContainText('無害な尿素に変えられた');
    await expect(page.locator('#ureaValue')).toHaveText('1');
    await page.waitForTimeout(600);   // 尿素が肝臓の上に動き終わるまで待つ

    await carry(page, 154, 146, BLADDER[0], BLADDER[1]);
    await expect(msg(page)).toContainText('ぼうこうには、尿になってから');
    await page.waitForTimeout(400);
    await carry(page, 154, 146, KIDNEY[0], KIDNEY[1]);
    await expect(msg(page)).toContainText('こし出されて尿になった');
    await expect(page.locator('#urineValue')).toHaveText('1');
    expect(await canvasImage(page)).not.toBe(before);

    await page.waitForTimeout(1200);  // 尿がぼうこうにたまるまで待つ
    await page.getByRole('button', { name: 'ぼうこうの尿を体外に出す' }).click();
    await expect(msg(page)).toContainText('道すじがつながった');
    await expect(page.locator('#outValue')).toHaveText('1');
  });

  test('尿素を汗腺に運ぶと、汗として排出される', async ({ page }) => {
    await carry(page, 440, 78, LIVER[0], LIVER[1]);
    await page.waitForTimeout(600);
    await carry(page, 154, 146, GLAND[0], GLAND[1]);
    await expect(msg(page)).toContainText('汗になって排出される');
  });

  test('ぼうこうに尿がないときに出そうとすると、何をすればよいかが出る', async ({ page }) => {
    await page.getByRole('button', { name: 'ぼうこうの尿を体外に出す' }).click();
    await expect(msg(page)).toContainText('まだ尿がたまっていない');
  });

  test('腎臓を大きく見ると、こし出すしくみの説明が出る', async ({ page }) => {
    await page.locator('#board').evaluate((c) => c.scrollIntoView({ block: 'center' }));
    const k = await toScreen(page, KIDNEY[0], KIDNEY[1]);
    await page.mouse.click(k.x, k.y);
    await expect(page.getByRole('button', { name: /^② 腎臓を大きく見る/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(msg(page)).toContainText('余分な水分や塩分とともにこし出されて尿になる');
  });

  test('全部運ぶとお祝いが出て、もとに戻すと最初にもどる', async ({ page }) => {
    const before = await canvasImage(page);
    const reset = page.getByRole('button', { name: 'もとに戻す' });
    await reset.click();
    await expect(msg(page)).toContainText('まだ何もしていない');

    const help = page.getByRole('button', { name: '1つ運んでもらう' });
    for (let i = 0; i < 12; i++) { await help.click(); await page.waitForTimeout(150); }
    await page.waitForTimeout(1500);
    await help.click();
    await expect(msg(page)).toContainText('全部体外に排出できた');
    await expect(page.locator('#outValue')).toHaveText('6');

    await reset.click();
    await expect(page.locator('#ureaValue')).toHaveText('0');
    await page.waitForTimeout(200);
    expect(await canvasImage(page)).toBe(before);
  });
});

test.describe('血液の循環', () => {
  const msg = (page: Page) => page.locator('#msg');
  // 場所の位置（座標は 600 × 420 を基準）
  const AT = {
    ra: [258, 170], rv: [258, 230], pa: [170, 125], lung: [338, 60], pv: [430, 118],
    la: [342, 170], lv: [342, 230], ao: [510, 262], intestine: [377, 345], vc: [80, 280],
  } as const;

  // 場所をタップして、赤血球が着くまで待つ
  async function tap(page: Page, k: keyof typeof AT) {
    await page.locator('#board').evaluate((c) => c.scrollIntoView({ block: 'center' }));
    const p = await toScreen(page, AT[k][0], AT[k][1]);
    await page.mouse.click(p.x, p.y);
  }
  async function arrive(page: Page, name: string) {
    await expect(page.locator('#placeValue')).toHaveText(name);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('circulation.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('つながっていない場所や、逆向きには進めない', async ({ page }) => {
    await tap(page, 'lv');
    await expect(msg(page)).toContainText('じかにつながっていない');
    await tap(page, 'rv');
    await arrive(page, '右心室');
    await tap(page, 'ra');
    await expect(msg(page)).toContainText('逆もどりできない');
    await expect(page.locator('#placeValue')).toHaveText('右心室');
  });

  test('肺で酸素を受け取り、肺動脈と肺静脈のクイズに答えられる', async ({ page }) => {
    const before = await canvasImage(page);
    await tap(page, 'rv'); await arrive(page, '右心室');
    await tap(page, 'pa'); await arrive(page, '肺動脈');
    await page.getByRole('button', { name: /^動脈血/ }).click();
    await expect(msg(page)).toContainText('ざんねん');
    await page.getByRole('button', { name: /^静脈血/ }).click();
    await expect(msg(page)).toContainText('正解');
    await tap(page, 'lung'); await arrive(page, '肺');
    await expect(page.locator('#o2Value')).toHaveText('多い');
    expect(await canvasImage(page)).not.toBe(before);
    await tap(page, 'pv'); await arrive(page, '肺静脈');
    await page.getByRole('button', { name: /^動脈血/ }).click();
    await expect(msg(page)).toContainText('正解');
    await tap(page, 'la'); await arrive(page, '左心房');
    await expect(msg(page)).toContainText('肺循環');
  });

  test('大動脈から器官を選んで、体を1周するとお祝いが出る', async ({ page }) => {
    const next = page.getByRole('button', { name: '次の場所へ進む' });
    for (let i = 0; i < 7; i++) { await next.click(); }
    await arrive(page, '大動脈');
    await tap(page, 'intestine'); await arrive(page, '小腸');
    await expect(msg(page)).toContainText('栄養分');
    await expect(page.locator('#o2Value')).toHaveText('少ない');
    await tap(page, 'vc'); await arrive(page, '大静脈');
    await tap(page, 'ra'); await arrive(page, '右心房');
    await expect(msg(page)).toContainText('1周できた');
    await expect(page.locator('#lapValue')).toHaveText('1');
    await expect(page.locator('#visitList li.is-found')).toHaveCount(3);
  });

  test('心臓を大きく見ると、心臓のしくみの説明が出る', async ({ page }) => {
    await page.getByRole('button', { name: /^② 心臓を大きく見る/ }).click();
    await expect(page.getByRole('button', { name: /^② 心臓を大きく見る/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(msg(page)).toContainText('弁があるので');
  });

  test('4つの器官を全部回るとお祝いが出て、もとに戻すと最初にもどる', async ({ page }) => {
    const before = await canvasImage(page);
    const reset = page.getByRole('button', { name: 'もとに戻す' });
    await reset.click();
    await expect(msg(page)).toContainText('まだ何もしていない');
    const next = page.getByRole('button', { name: '次の場所へ進む' });
    // キーボードでも進められる（Enter キーで 40 回押す）
    await next.focus();
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Enter'); }
    await expect(page.locator('#lapValue')).toHaveText('4');
    await expect(page.locator('#visitList li.is-found')).toHaveCount(6);
    await reset.click();
    await expect(page.locator('#lapValue')).toHaveText('0');
    await page.waitForTimeout(400);
    expect(await canvasImage(page)).toBe(before);
  });
});

test('キャンバスは、画面の細かさに合わせてくっきり描かれる', async ({ page }) => {
  await page.goto('fall.html');
  const info = await page.locator('#board').evaluate((c: HTMLCanvasElement) => ({
    width: c.width,
    base: Number(c.dataset.w),
    ratio: Math.min(window.devicePixelRatio || 1, 2),
  }));
  expect(info.base).toBe(600);
  expect(info.width).toBe(600 * info.ratio);
});
