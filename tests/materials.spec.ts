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

  // キャンバスの座標（600 × 360 を基準）を、画面の座標に直す。先にキャンバスを画面に出す
  async function at(page: Page, x: number, y: number) {
    await page.locator('#board').scrollIntoViewIfNeeded();
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

  test('①ルーペで外観を見つけ、手で裏返すと、ろうとも見つかる', async ({ page }) => {
    await tool(page, 'ルーペ');
    for (const [name, x, y] of [['口', 166, 180], ['あし', 96, 162], ['目', 206, 138], ['外とう膜', 360, 152], ['ひれ', 478, 100]] as const) {
      await tap(page, x, y);
      await expect(msg(page)).toContainText(`「${name}」を見つけた`);
    }
    await expect(msg(page)).toContainText('裏返してみよう');
    await tool(page, '手');
    await tap(page, 360, 180);
    await expect(msg(page)).toContainText('ろうとのある側が上');
    await tool(page, 'ルーペ');
    await page.waitForTimeout(600);   // 裏返す動きが終わるまで待つ
    await tap(page, 246, 180);
    await expect(msg(page)).toContainText('外観の部分を全部見つけた');
    await expect(page.locator('#foundValue')).toHaveText('6');
  });

  test('②背中側のままでは切れず、ゆっくり切ると傷をつけずに切れる', async ({ page }) => {
    await page.locator('.step-btn', { hasText: '外とう膜を切る' }).click();
    await tool(page, 'はさみ');
    await tap(page, 260, 180);
    await expect(msg(page)).toContainText('ろうとのある側を上にしよう');

    await tool(page, '手');
    await tap(page, 360, 180);
    await page.waitForTimeout(600);
    await tool(page, 'はさみ');
    await dragThrough(page, line(260, 546, 180));
    await expect(msg(page)).toContainText('内臓に傷をつけずに切れた');
    await expect(page.locator('#scratchValue')).toHaveText('0');
  });

  test('②はさみを速く動かすと、内臓に傷がつく', async ({ page }) => {
    await page.locator('.step-btn', { hasText: '外とう膜を切る' }).click();
    await page.getByRole('button', { name: 'やり方を見せてもらう' }).click();   // ろうとのある側を上にする
    await page.waitForTimeout(600);
    await tool(page, 'はさみ');
    await dragThrough(page, [[260, 180], [300, 180], [380, 180], [460, 180]], 5);
    await expect(msg(page)).toContainText('内臓に傷をつけてしまった');
    await expect(page.locator('#scratchValue')).not.toHaveText('0');
  });

  test('③ピンセットで上と下の切り口を引っぱると、外とう膜が開く', async ({ page }) => {
    await page.locator('.step-btn', { hasText: '外とう膜を広げる' }).click();
    await tool(page, 'ピンセット');
    await dragThrough(page, [[380, 176], [380, 150], [380, 120], [380, 95]]);
    await expect(msg(page)).toContainText('上が開いた');
    await dragThrough(page, [[380, 184], [380, 220], [380, 250], [380, 270]]);
    await expect(msg(page)).toContainText('外とう膜を広げた');
  });

  test('④ピンセットで内臓にさわると、名前が見つかる', async ({ page }) => {
    await page.locator('.step-btn', { hasText: '内臓の観察' }).click();
    await tool(page, 'ピンセット');
    const organs = [['肛門', 270, 181], ['心臓', 421, 148], ['胃', 472, 182], ['墨袋', 342, 167], ['腸', 380, 196], ['肝臓', 330, 184], ['えら', 330, 118]] as const;
    for (const [name, x, y] of organs) {
      await tap(page, x, y);
      await expect(msg(page)).toContainText(`「${name}」を見つけた`);
    }
    await expect(msg(page)).toContainText('内臓を全部見つけた');
  });

  test('⑤切りはなして、ピンセットで引っぱると内臓が裏返る', async ({ page }) => {
    await page.locator('.step-btn', { hasText: '切りはなして裏返す' }).click();
    await tool(page, 'はさみ');
    await dragThrough(page, line(290, 454, 218));
    await expect(msg(page)).toContainText('切りはなせた');
    await tool(page, 'ピンセット');
    await dragThrough(page, [[372, 182], [372, 165], [372, 150], [372, 125]]);
    await expect(msg(page)).toContainText('内臓を裏返した');
    await expect(page.locator('.step-btn', { hasText: '消化管のつながり' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('⑥スポイトで赤インクを吸い、口でおしつづけると肛門から出る', async ({ page }) => {
    await page.locator('.step-btn', { hasText: '消化管のつながり' }).click();
    await tool(page, 'スポイト');

    // 口の外でおすと、皿にこぼれる
    await tap(page, 400, 300);
    await expect(msg(page)).toContainText('ビーカーの赤インクの中でおして');

    const suck = async () => {
      await tap(page, 547, 95);
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
  });

  test('「やり方を見せてもらう」だけでも最後まで進められ、やり直すと最初にもどる', async ({ page }) => {
    const before = await canvasImage(page);
    const reset = page.getByRole('button', { name: '最初からやり直す' });
    await reset.click();
    await expect(msg(page)).toContainText('まだ何もしていない');

    const help = page.getByRole('button', { name: 'やり方を見せてもらう' });
    const next = page.getByRole('button', { name: '次の手順へ進む' });
    for (let i = 0; i < 7; i++) { await help.click(); await page.waitForTimeout(550); }
    await expect(msg(page)).toContainText('外観の部分を全部見つけた');
    await next.click();
    for (let i = 0; i < 4; i++) await help.click();
    await expect(msg(page)).toContainText('先端まで切れた');
    await next.click();
    await help.click();
    await expect(msg(page)).toContainText('外とう膜を広げた');
    await next.click();
    for (let i = 0; i < 7; i++) await help.click();
    await expect(msg(page)).toContainText('内臓を全部見つけた');
    await next.click();
    await help.click();
    await help.click();
    await expect(msg(page)).toContainText('内臓を裏返した');
    await page.waitForTimeout(800);
    for (let i = 0; i < 8; i++) { await help.click(); await page.waitForTimeout(150); }
    await expect(msg(page)).toContainText('肛門から出てきた');

    await reset.click();
    await expect(page.locator('.step-btn').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#foundValue')).toHaveText('0');
    await page.waitForTimeout(100);
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
