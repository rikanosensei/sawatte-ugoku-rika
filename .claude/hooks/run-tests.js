// Claude が .html / .css を書き換えたあとに、Playwright のテストを走らせるフック。
// 失敗したら結果を Claude に返し（終了コード 2）、直すように促す。
const { spawnSync } = require('child_process');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    const data = JSON.parse(input);
    filePath = (data.tool_input && data.tool_input.file_path) || '';
  } catch (e) {
    process.exit(0);
  }

  // サイトのファイル（.html / .css）以外は何もしない
  if (!/\.(html|css)$/i.test(filePath)) process.exit(0);
  const rel = path.relative(projectDir, filePath);
  if (rel.startsWith('..') || /^(node_modules|playwright-report|test-results|\.claude)[\\/]/.test(rel)) process.exit(0);
  // テスト用サーバー（npx http-server）が node を見つけられるように PATH を足す
  const env = { ...process.env, FORCE_COLOR: '0' };
  delete env.NO_COLOR;
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = path.dirname(process.execPath) + path.delimiter + (env[pathKey] || '');

  const cli = path.join(projectDir, 'node_modules', '@playwright', 'test', 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'test', '--reporter=line'], {
    cwd: projectDir,
    env,
    encoding: 'utf8',
    timeout: 170000,
  });

  if (result.status === 0) process.exit(0);

  const output = ((result.stdout || '') + (result.stderr || '')).trim();
  const tail = output.split(/\r?\n/).slice(-60).join('\n');
  process.stderr.write(
    `${rel} を変更したあと、テストが失敗しました（npm test）。原因を調べて直してください。\n\n${tail || result.error || '（出力なし）'}\n`,
  );
  process.exit(2);
});
