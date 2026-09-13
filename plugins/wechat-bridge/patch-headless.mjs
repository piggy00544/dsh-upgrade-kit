#!/usr/bin/env node
// patch-headless — make the DSH headless profile honor DSH_HEADLESS_SESSION_ID,
// so the WeChat bridge keeps ONE persistent session across messages.
//
// Idempotent. Tolerates upstream renames (SessionId → brandString, ...) by
// matching the sessionId construction pattern rather than an exact line.
//
// Usage:
//   node patch-headless.mjs                 # auto-discover under $DSH_HOME / common paths
//   node patch-headless.mjs --file <path>   # patch a specific bundle entry file

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MARKER = 'DSH_HEADLESS_SESSION_ID';
// sessionId: <brand>(`session-${randomUUID()}`),
const PATTERN = /sessionId:\s*([A-Za-z_$][\w$]*)\(`session-\$\{randomUUID\(\)\}`\)/;

function candidates() {
  const out = [];
  const home = process.env.DSH_HOME;
  if (home) out.push(path.join(home, 'profiles', 'headless', 'node_modules', '@deepseek-ai', 'dsh-headless', 'lib', 'index.js'));
  for (const base of [
    path.join(os.homedir(), 'Library', 'Application Support', 'DeepSeek Harness Lab', 'home'),
    path.join(os.homedir(), '.dsh'),
  ]) {
    out.push(path.join(base, 'profiles', 'headless', 'node_modules', '@deepseek-ai', 'dsh-headless', 'lib', 'index.js'));
  }
  return out;
}

function patchFile(target) {
  const src = fs.readFileSync(target, 'utf8');
  if (src.includes(MARKER)) {
    console.log(`✔ 已打过补丁：${target}`);
    return true;
  }
  const m = src.match(PATTERN);
  if (!m) {
    console.error(`✗ 未找到会话构造模式（上游可能又改了）：${target}`);
    return false;
  }
  const next = src.replace(PATTERN, (whole, brand) =>
    `sessionId: ${brand}(process.env.DSH_HEADLESS_SESSION_ID || \`session-\${randomUUID()}\`)`);
  fs.writeFileSync(target, next, 'utf8');
  console.log(`✔ 已打补丁：${target}（${m[1]} 形式）`);
  return true;
}

function main() {
  const argv = process.argv.slice(2);
  const fi = argv.indexOf('--file');
  if (fi >= 0 && argv[fi + 1]) {
    const target = argv[fi + 1];
    if (!fs.existsSync(target)) {
      console.error(`✗ 文件不存在：${target}`);
      process.exit(1);
    }
    process.exit(patchFile(target) ? 0 : 1);
  }
  let target = null;
  for (const p of candidates()) {
    if (fs.existsSync(p)) { target = p; break; }
  }
  if (!target) {
    console.error('✗ 找不到 headless bundle 的 lib/index.js（可用 --file 指定）');
    process.exit(1);
  }
  process.exit(patchFile(target) ? 0 : 1);
}

main();
