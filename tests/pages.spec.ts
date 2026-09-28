import { test, expect } from '@playwright/test';

// サイトの全ページ
const PAGES = [
  'index.html',
  'grade1.html',
  'grade2.html',
  'grade3.html',
  'grade1-physics.html',
  'grade2-biology.html',
  'grade3-physics.html',
  'mirror.html',
  'digestion.html',
  'fall.html',
];

for (const path of PAGES) {
  test.describe(path, () => {
    test('エラーなく開き、題名と見出しがある', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(/俺の理科教材/);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
    });

    test('サイト内のリンクがすべて開ける', async ({ page, request }) => {
      await page.goto(path);
      const hrefs = await page.locator('a[href]').evaluateAll((links) =>
        links.map((a) => a.getAttribute('href') ?? ''),
      );
      const internal = [...new Set(hrefs)]
        .filter((h) => !/^(https?:|mailto:|#)/.test(h))
        .map((h) => h.split('#')[0]);

      for (const href of new Set(internal)) {
        const res = await request.get(href);
        expect(res.status(), `${path} → ${href}`).toBe(200);
      }
    });

    test('横にはみ出さない（横スクロールが出ない）', async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('トップから学年・分野を選んで教材までたどれる', async ({ page }) => {
  await page.goto('index.html');
  await page.getByRole('link', { name: /中学1年/ }).click();
  await expect(page).toHaveURL(/grade1\.html$/);

  await page.getByRole('link', { name: /物理/ }).click();
  await expect(page).toHaveURL(/grade1-physics\.html$/);

  await page.getByRole('link', { name: '鏡にうつる像と光の反射' }).click();
  await expect(page).toHaveURL(/mirror\.html$/);
  await expect(page.locator('h1')).toContainText('鏡にうつる像と光の反射');

  // パンくずで学年のページへ戻れる
  await page.getByRole('navigation', { name: '現在位置' }).getByRole('link', { name: '中学1年' }).click();
  await expect(page).toHaveURL(/grade1\.html$/);
});

test('準備中の分野はリンクになっていない', async ({ page }) => {
  await page.goto('grade2.html');
  await expect(page.locator('.tile.is-disabled')).toHaveCount(3);
  await expect(page.locator('a.tile')).toHaveCount(1);
});

test('キーボードで最初に「本文へ移動」が選ばれる', async ({ page, browserName }) => {
  test.skip(test.info().project.name === 'mobile', 'スマホにはキーボード操作がない');
  await page.goto('index.html');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: '本文へ移動' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
});
