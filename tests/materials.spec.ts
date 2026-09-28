import { test, expect, type Page } from '@playwright/test';

// キャンバスの今の絵を文字列にして取り出す（絵が変わったかを比べるため）
async function canvasImage(page: Page) {
  return page.locator('#board').evaluate((c: HTMLCanvasElement) => c.toDataURL());
}

// キャンバスの中の座標（内部の大きさ）を、画面上の座標に直す
async function toScreen(page: Page, x: number, y: number) {
  const canvas = page.locator('#board');
  const box = await canvas.boundingBox();
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
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
    await expect(reset).toBeDisabled();

    const before = await canvasImage(page);
    await page.getByRole('button', { name: '頭の先からの光' }).click();
    await expect(msg).toContainText('頭の先から出た光');
    await page.getByRole('button', { name: 'つま先からの光' }).click();
    await expect(msg).toContainText('つま先から出た光');
    await expect(reset).toBeEnabled();
    expect(await canvasImage(page)).not.toBe(before);

    await reset.click();
    await expect(reset).toBeDisabled();
    await expect(msg).toContainText('ドラッグしよう');
    expect(await canvasImage(page)).toBe(before);
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
    await expect(page.getByRole('button', { name: '線をすべて消す' })).toBeEnabled();
  });

  test('鏡の手前で指を離すと、のばすように案内が出る', async ({ page }) => {
    const eye = await toScreen(page, 668, 140);
    const notFar = await toScreen(page, 560, 140);

    await page.mouse.move(eye.x, eye.y);
    await page.mouse.down();
    await page.mouse.move(notFar.x, notFar.y, { steps: 5 });
    await page.mouse.up();

    await expect(page.locator('#msg')).toContainText('鏡の向こう側');
    await expect(page.getByRole('button', { name: '線をすべて消す' })).toBeDisabled();
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
    expect(await canvasImage(page)).not.toBe(before);
  });

  test('もとに戻すと、選んだ状態と図が最初に戻る', async ({ page }) => {
    const reset = page.getByRole('button', { name: 'もとに戻す' });
    await expect(reset).toBeDisabled();
    const before = await canvasImage(page);

    await page.getByRole('button', { name: /^アミラーゼ/ }).click();
    await page.getByRole('button', { name: /^ペプシン/ }).click();
    await reset.click();

    await expect(reset).toBeDisabled();
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

  test('スタートを押すとボールが落ちる', async ({ page }) => {
    const before = await canvasImage(page);
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect.poll(() => canvasImage(page)).not.toBe(before);
  });
});
