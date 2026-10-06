import { test, expect } from '@playwright/test';

// サイトの全ページ
const PAGES = [
  'index.html',
  'grade1.html',
  'grade2.html',
  'grade3.html',
  'mirror.html',
  'digestion.html',
  'squid.html',
  'fall.html',
];

const isMobile = () => test.info().project.name === 'mobile';

for (const path of PAGES) {
  test.describe(path, () => {
    test('エラーなく開き、題名と見出しがある', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(/さわってうごく理科教材/);
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

    test('学年のナビゲーションが見えていて、4つとも押せる', async ({ page }) => {
      await page.goto(path);
      const nav = page.getByRole('navigation', { name: '学年' });
      await expect(nav).toBeVisible();
      for (const name of ['ホーム', '1年', '2年', '3年']) {
        const link = nav.getByRole('link', { name });
        await expect(link).toBeInViewport();
        const box = await link.boundingBox();
        expect(box!.height, `${name} の高さ`).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test('トップから教材を開き、もどるボタンで学年、ホームへもどれる', async ({ page }) => {
  await page.goto('index.html');
  await page.getByRole('link', { name: /鏡にうつる像と光の反射/ }).click();
  await expect(page).toHaveURL(/mirror\.html$/);
  await expect(page.locator('h1')).toHaveText('鏡にうつる像と光の反射');

  await page.getByRole('link', { name: '中学1年の教材にもどる' }).click();
  await expect(page).toHaveURL(/grade1\.html$/);
  await expect(page.locator('h1')).toHaveText('中学1年');

  await page.getByRole('link', { name: 'ホームにもどる' }).click();
  await expect(page).toHaveURL(/index\.html$/);
});

test('学年のナビゲーションで、いまの学年に印がつく', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: '学年' });

  await page.goto('grade2.html');
  await expect(nav.getByRole('link', { name: '2年' })).toHaveAttribute('aria-current', 'page');

  // 教材のページでは、その教材の学年に印がつく
  await page.goto('fall.html');
  await expect(nav.getByRole('link', { name: '3年' })).toHaveAttribute('aria-current', 'true');
  await expect(nav.getByRole('link', { name: 'ホーム' })).not.toHaveAttribute('aria-current', /.*/);
});

test('トップには全部の教材が並ぶ', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('.m-card')).toHaveCount(4);
});

test('教材がまだない分野は「準備中」と出て、リンクにはならない', async ({ page }) => {
  await page.goto('grade2.html');
  await expect(page.locator('.empty')).toHaveCount(3);
  await expect(page.locator('.m-card')).toHaveCount(2);
  const bio = page.locator('.field-section.field-biology .m-card');
  await expect(bio.nth(0)).toHaveAttribute('href', 'digestion.html');
  await expect(bio.nth(1)).toHaveAttribute('href', 'squid.html');
});

test('パソコンではパンくずが出て、スマホでは隠れる', async ({ page }) => {
  await page.goto('mirror.html');
  const crumb = page.getByRole('navigation', { name: '現在位置' });
  if (isMobile()) {
    await expect(crumb).toBeHidden();
  } else {
    await expect(crumb).toBeVisible();
    await crumb.getByRole('link', { name: '中学1年' }).click();
    await expect(page).toHaveURL(/grade1\.html$/);
  }
});

test('キーボードで最初に「本文へ移動」が選ばれる', async ({ page }) => {
  test.skip(isMobile(), 'スマホにはキーボード操作がない');
  await page.goto('index.html');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: '本文へ移動' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
});

test('教材の説明はたためて、開くと読める', async ({ page }) => {
  await page.goto('fall.html');
  const note = page.locator('details', { hasText: 'このモデルについて' });
  await expect(note).not.toHaveAttribute('open', '');
  await note.locator('summary').click();
  await expect(note.getByText('重力の強さは、地球を1としたときの倍率')).toBeVisible();
});
