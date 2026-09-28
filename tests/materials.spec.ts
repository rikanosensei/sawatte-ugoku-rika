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
    await expect(msg).toContainText('足もとから出た光');
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
    expect(await canvasImage(page)).toBe(before);
    await page.getByRole('button', { name: /^リパーゼ/ }).click();
    await expect.poll(() => canvasImage(page)).not.toBe(before); // 粒は少しずつはなれる
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
