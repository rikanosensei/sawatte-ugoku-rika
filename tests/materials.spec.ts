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
  // キャンバスの中の座標（600 × 360 を基準）をタップする
  // （スマホでは手順のボタンがキャンバスの下にあるので、先にキャンバスを画面に出す）
  async function tap(page: Page, x: number, y: number) {
    await page.locator('#board').scrollIntoViewIfNeeded();
    const p = await toScreen(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  const msg = (page: Page) => page.locator('#msg');

  test.beforeEach(async ({ page }) => {
    await page.goto('squid.html');
    await page.waitForLoadState('networkidle'); // 図の文字のフォントが届いて描き直されるまで待つ
  });

  test('①外観：体の部分をタップすると名前が見つかり、全部見つけるとお祝い', async ({ page }) => {
    const before = await canvasImage(page);
    const parts: [string, number, number][] = [
      ['口', 168, 180], ['目', 207, 141], ['ろうと', 244, 180], ['ひれ', 500, 100], ['外とう膜', 360, 160], ['あし', 90, 140],
    ];
    for (const [name, x, y] of parts.slice(0, 5)) {
      await tap(page, x, y);
      await expect(msg(page)).toContainText(`「${name}」を見つけた`);
    }
    expect(await canvasImage(page)).not.toBe(before);
    await expect(page.locator('#outsideValue')).toHaveText('5');
    await tap(page, 90, 140);
    await expect(msg(page)).toContainText('外観の部分を全部見つけた');

    // もう見つけた部分をもう一度タップしたとき
    await tap(page, 168, 180);
    await expect(msg(page)).toContainText('もう見つけた');
  });

  test('②切り開く：点線にそってドラッグして切り、ふちを引っぱって広げる', async ({ page }) => {
    await page.getByRole('button', { name: '次の手順へ進む' }).click();
    await expect(page.getByRole('button', { name: /^② 外とう膜を切り開く/ })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#board').scrollIntoViewIfNeeded();
    const start = await toScreen(page, 262, 180);
    const off = await toScreen(page, 330, 240);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(off.x, off.y, { steps: 5 });
    await expect(msg(page)).toContainText('内臓に傷をつけてしまう');   // 点線からはずれると注意が出る

    const beforeCut = await canvasImage(page);
    for (const x of [320, 380, 440, 500, 544]) {
      const p = await toScreen(page, x, 181);
      await page.mouse.move(p.x, p.y, { steps: 5 });
    }
    await page.mouse.up();
    await expect(msg(page)).toContainText('先端まで切れた');
    expect(await canvasImage(page)).not.toBe(beforeCut);

    // 切り口のふちをつまんで、下に引っぱる
    const edge = await toScreen(page, 370, 182);
    const pulled = await toScreen(page, 370, 270);
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(pulled.x, pulled.y, { steps: 8 });
    await page.mouse.up();
    await expect(msg(page)).toContainText('外とう膜を広げた');
  });

  test('②切り開く：ボタンでも切り進めて、広げられる', async ({ page }) => {
    await page.getByRole('button', { name: /^② 外とう膜を切り開く/ }).click();
    const cut = page.getByRole('button', { name: 'はさみで少し切り進める' });
    await cut.click();
    await expect(msg(page)).toContainText('少し切り進めた');
    for (let i = 0; i < 3; i++) await cut.click();
    await expect(msg(page)).toContainText('先端まで切れた');
    await page.getByRole('button', { name: '外とう膜を広げる' }).click();
    await expect(msg(page)).toContainText('外とう膜を広げた');
  });

  test('③内臓：内臓をタップすると名前が見つかり、全部見つけるとお祝い', async ({ page }) => {
    await page.getByRole('button', { name: /^③ 内臓の観察/ }).click();
    const organs: [string, number, number][] = [
      ['肛門', 270, 180], ['心臓', 418, 150], ['胃', 470, 182], ['墨袋', 340, 168], ['腸', 380, 194], ['肝臓', 330, 184], ['えら', 330, 116],
    ];
    for (const [name, x, y] of organs) {
      await tap(page, x, y);
      await expect(msg(page)).toContainText(`「${name}」を見つけた`);
    }
    await expect(page.locator('#organValue')).toHaveText('7');
    await expect(msg(page)).toContainText('内臓を全部見つけた');
  });

  test('④消化管：切りはなして裏返し、スポイトをおすと、赤インクが肛門から出る', async ({ page }) => {
    await page.getByRole('button', { name: /^④ 消化管のつながり/ }).click();
    const ink = page.locator('#inkValue');

    // 点線にそってはさみをドラッグして、内臓と外とう膜を切りはなす
    await page.locator('#board').scrollIntoViewIfNeeded();
    const start = await toScreen(page, 290, 216);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const x of [340, 390, 440, 455]) {
      const p = await toScreen(page, x, 216);
      await page.mouse.move(p.x, p.y, { steps: 5 });
    }
    await page.mouse.up();
    await expect(msg(page)).toContainText('切りはなせた');

    // 内臓をタップして裏返す
    await tap(page, 360, 180);
    await expect(msg(page)).toContainText('内臓を裏返した');

    await tap(page, 168, 180);
    await expect(msg(page)).toContainText('スポイトを口に当てた');
    const press = page.getByRole('button', { name: 'スポイトをおす' });
    for (const place of ['食道', '胃', '腸']) {
      await press.click();
      await expect(ink).toHaveText(place);
    }
    await press.click();
    await expect(ink).toHaveText('肛門');
    await expect(msg(page)).toContainText('肛門から出てきた');
  });

  test('④消化管：スポイトをおしつづけると、赤インクが進む', async ({ page }) => {
    await page.getByRole('button', { name: /^④ 消化管のつながり/ }).click();
    await page.getByRole('button', { name: '内臓と外とう膜を切りはなす' }).click();
    await page.getByRole('button', { name: '内臓を裏返す' }).click();
    await page.getByRole('button', { name: 'スポイトを口に当てる' }).click();

    await page.locator('#board').scrollIntoViewIfNeeded();
    const dropper = await toScreen(page, 166, 110);
    await page.mouse.move(dropper.x, dropper.y);
    await page.mouse.down();
    await expect(page.locator('#inkValue')).not.toHaveText('まだ');
    await page.mouse.up();
  });

  test('最初からやり直すと、手順・数・図が最初に戻る', async ({ page }) => {
    const reset = page.getByRole('button', { name: '最初からやり直す' });
    const before = await canvasImage(page);

    // まだ何もしていないときに押すと、何をすればよいかが出る
    await reset.click();
    await expect(msg(page)).toContainText('まだ何もしていない');

    await page.getByRole('button', { name: '名前を1つ教えてもらう' }).click();
    await page.getByRole('button', { name: /^④ 消化管のつながり/ }).click();
    await page.getByRole('button', { name: '内臓と外とう膜を切りはなす' }).click();
    await page.getByRole('button', { name: '内臓を裏返す' }).click();
    await page.getByRole('button', { name: 'スポイトを口に当てる' }).click();
    await page.getByRole('button', { name: 'スポイトをおす' }).click();
    await reset.click();

    await expect(page.getByRole('button', { name: /^① 外観の観察/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#outsideValue')).toHaveText('0');
    await expect(page.locator('#inkValue')).toHaveText('まだ');
    await expect(msg(page)).toContainText('全身の外観を観察しよう');
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
