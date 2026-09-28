import { defineConfig, devices } from '@playwright/test';

/**
 * 俺の理科教材のテスト設定
 * https://playwright.dev/docs/test-configuration
 *
 * テストのときだけ、サイトを http://localhost:4173 で開く。
 * （画面の確認用の 5173 番とぶつからないように、別の番号にしている）
 */
const PORT = 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },

  // 授業で使う Chrome / Edge と同じ仕組みのブラウザで、パソコン幅とスマホ幅を確かめる
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: `npx http-server -p ${PORT} -c-1 --silent`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
