#!/usr/bin/env node
// patch-headless — make the DSH headless profile honor DSH_HEADLESS_SESSION_ID,
// so the WeChat bridge keeps ONE persistent session across messages.
//
// Idempotent: prints "already patched" when the patch is present.
// Locates the headless bundle via $DSH_HOME/profiles/headless/node_modules/
// (first) or falls back to scanning common locations.
//
// Usage: node patch-headless.mjs

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const NEEDLE = 'sessionId: SessionId(`session-${randomUUID()}`),';
const REPLACEMENT = 'sessionId: SessionId(process.env.DSH_HEADLESS_SESSION_ID || `session-${randomUUID()}`),';
const MARKER = 'DSH_HEADLESS_SESSION_ID';

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

function main() {
  let target = null;
  for (const p of candidates()) {
    if (fs.existsSync(p)) { target = p; break; }
  }
  if (!target) {
    console.error('✗ 找不到 headless bundle 的 lib/index.js。请手动执行：');
    console.error('  找到 $DSH_HOME/profiles/headless/node_modules/@deepseek-ai/dsh-headless/lib/index.js');
    console.error('  把 sessionId: SessionId(`session-${randomUUID()}`), 改为');
    console.error('  sessionId: SessionId(process.env.DSH_HEADLESS_SESSION_ID || `session-${randomUUID()}`),');
    process.exit(1);
  }
  const src = fs.readFileSync(target, 'utf8');
  if (src.includes(MARKER)) {
    console.log(`✔ 已打过补丁：${target}`);
    return;
  }
  if (!src.includes(NEEDLE)) {
    console.error(`✗ 补丁目标文本未找到（版本可能已变化）：${target}`);
    console.error('  请按 README 手动处理。');
    process.exit(1);
  }
  fs.writeFileSync(target, src.replace(NEEDLE, REPLACEMENT), 'utf8');
  console.log(`✔ 已打补丁：${target}`);
}

main();
