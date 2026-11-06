#!/usr/bin/env node
/**
 * 版本號：大.中.細（semver）。用法：
 *   pnpm release:patch "修正 xxx"   細更新（修正、細改動）   0.0.1 → 0.0.2
 *   pnpm release:minor "加 xxx"     中更新（新功能）          0.0.2 → 0.1.0
 *   pnpm release:major "大改版"      大更新（大改版、唔兼容）  0.1.0 → 1.0.0
 * 會自動計新版本號，同時更新：packages/core/src/version.ts（網頁同 App 顯示）、各 package.json、
 * apps/mobile/app.json（expo.version，iOS buildNumber、Android versionCode 每次 +1），同埋喺 CHANGELOG.md 加一行。
 * 只用 Node 標準庫。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kind = process.argv[2];
const note = process.argv.slice(3).join(' ').trim();
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('用法：node scripts/version.mjs <patch|minor|major> [更新內容]');
  process.exit(1);
}

const versionFile = join(root, 'packages/core/src/version.ts');
const src = readFileSync(versionFile, 'utf8');
const m = src.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!m) throw new Error('version.ts 搵唔到 APP_VERSION');
let [maj, min, pat] = m.slice(1).map(Number);
if (kind === 'major') [maj, min, pat] = [maj + 1, 0, 0];
else if (kind === 'minor') [min, pat] = [min + 1, 0];
else pat += 1;
const next = `${maj}.${min}.${pat}`;

writeFileSync(versionFile, src.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${next}'`));

for (const p of ['package.json', 'apps/web/package.json', 'apps/mobile/package.json', 'packages/core/package.json']) {
  const file = join(root, p);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = next;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

const appJsonFile = join(root, 'apps/mobile/app.json');
const app = JSON.parse(readFileSync(appJsonFile, 'utf8'));
app.expo.version = next;
app.expo.ios.buildNumber = String(Number(app.expo.ios.buildNumber ?? 0) + 1);
app.expo.android.versionCode = Number(app.expo.android.versionCode ?? 0) + 1;
writeFileSync(appJsonFile, JSON.stringify(app, null, 2) + '\n');

const label = { patch: '細更新', minor: '中更新', major: '大更新' }[kind];
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
const logFile = join(root, 'CHANGELOG.md');
const head = '# 更新紀錄\n\n版本號：大.中.細。細更新 = 修正同細改動；中更新 = 新功能；大更新 = 大改版。\n\n';
const old = existsSync(logFile) ? readFileSync(logFile, 'utf8').replace(head, '') : '';
writeFileSync(logFile, `${head}## ${next}（${date}，${label}）\n\n- ${note || label}\n\n${old}`);

console.log(`${m[1]}.${m[2]}.${m[3]} → ${next}（${label}）`);
