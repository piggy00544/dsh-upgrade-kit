#!/usr/bin/env node
/**
 * 单机测试 dsh-research-mcp：
 *   node test.mjs [search-query]
 * 完整模拟 MCP stdio 客户端：initialize → initialized → tools/list → tools/call(search) → tools/call(fetch)
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const child = spawn(process.execPath, [SERVER], {
  env: { ...process.env, HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:7890', HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:7890' },
  stdio: ['pipe', 'pipe', 'inherit'],
});
child.on('error', (e) => { console.error('❌ spawn failed:', e.message); process.exit(1); });
const rl = createInterface({ input: child.stdout });
let nextId = 0;
const pending = new Map();
let tools = [];

function send(method, params) {
  const id = ++nextId;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  child.stdin.write(msg + '\n');
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
});

async function callTool(name, args) {
  const res = await send('tools/call', { name, arguments: args });
  const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return { isError: res.isError, text };
}

try {
  const init = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.1' },
  });
  console.log('✅ initialize:', init.serverInfo.name, init.serverInfo.version, '| protocol', init.protocolVersion);
  notify('notifications/initialized', {});

  const list = await send('tools/list', {});
  tools = list.tools.map((t) => t.name);
  console.log('✅ tools:', tools.join(', '));

  const query = process.argv[2] || 'deep research agents open source';
  const sr = await callTool('search', { query, engines: process.argv[3] || 'ddg,hn', count: 5 });
  console.log('✅ search ok, isError=', sr.isError);
  console.log(sr.text.slice(0, 2000));

  const fr = await callTool('fetch', { url: 'https://news.ycombinator.com/front', maxChars: 800 });
  console.log('✅ fetch ok, isError=', fr.isError);
  console.log(fr.text.slice(0, 500));

  const sh = await callTool('site_hint', { domain: 'x.com' });
  console.log('✅ site_hint ok:', sh.text.slice(0, 200));
} catch (e) {
  console.error('❌ FAILED:', e.message);
  process.exitCode = 1;
} finally {
  child.kill();
  setTimeout(() => process.exit(), 100);
}
