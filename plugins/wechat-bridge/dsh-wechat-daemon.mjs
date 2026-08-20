#!/usr/bin/env node
// dsh-wechat-daemon — inbound bridge daemon.
// Long-polls the WeChat iLink bot API (getupdates); for each text message
// from the allowlisted user (the person who scanned the login QR), runs
// `dsh --profile headless "<message>"` on this machine and replies in-thread
// via sendmessage. Direct API, no OpenClaw, no gateway.
//
// Credentials: ~/.local/share/dsh-wechat/credentials.json (0600)
//
// Overridable via environment:
//   DSH_BIN             path to the dsh CLI (default: `which dsh`)
//   DSH_WECHAT_CWD      working directory for headless tasks (default: $HOME)
//   DSH_WEB_URL         DSH web server base URL (default: http://127.0.0.1:3080)
//   DSH_HOME            harness home; sessions live under <DSH_HOME>/sessions
//   DSH_NOTIFY_BIN      path to dsh-notify (default: /opt/homebrew/bin/dsh-notify)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const BASE = 'https://ilinkai.weixin.qq.com';
const APP_ID = 'bot';
const CLIENT_VERSION = '2.1.6';
const STATE_DIR = path.join(os.homedir(), '.local', 'share', 'dsh-wechat');
const CREDS = path.join(STATE_DIR, 'credentials.json');
const STATE_FILE = path.join(STATE_DIR, 'daemon-state.json');
const LOG_FILE = path.join(STATE_DIR, 'daemon.log');

function whichDsh() {
  try { return execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim(); }
  catch { return 'dsh'; }
}
const DSH_BIN = process.env.DSH_BIN || whichDsh();
const DSH_CWD = process.env.DSH_WECHAT_CWD || os.homedir();
const DSH_WEB_URL = process.env.DSH_WEB_URL || 'http://127.0.0.1:3080';
const DSH_NOTIFY_BIN = process.env.DSH_NOTIFY_BIN || '/opt/homebrew/bin/dsh-notify';
const DSH_SESSIONS_DIR = (() => {
  const home = process.env.DSH_HOME;
  if (home) return path.join(home, 'sessions');
  for (const cand of [
    path.join(os.homedir(), 'Library', 'Application Support', 'DeepSeek Harness Lab', 'home'),
    path.join(os.homedir(), '.dsh'),
  ]) {
    if (fs.existsSync(path.join(cand, 'sessions'))) return path.join(cand, 'sessions');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'DeepSeek Harness Lab', 'home', 'sessions');
})();
const TASK_TIMEOUT_MS = 15 * 60_000;
const MAX_REPLY_CHARS = 3800;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadCreds() {
  return JSON.parse(fs.readFileSync(CREDS, 'utf8'));
}

function loadState() {
  let s;
  try { s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { s = {}; }
  if (!s.get_updates_buf) s.get_updates_buf = '';
  if (!s.lastSeq) s.lastSeq = 0;
  if (!s.sessionId) {
    s.sessionId = `session-wechat-${crypto.randomUUID().slice(0, 8)}`;
    saveState(s);
  }
  return s;
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s), { mode: 0o600 });
}

function buildClientVersionInt(v) {
  const [a = 0, b = 0, c = 0] = v.split('.').map((n) => parseInt(n, 10) || 0);
  return ((a & 0xff) << 16) | ((b & 0xff) << 8) | (c & 0xff);
}
function randomUin() {
  const u = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(u), 'utf-8').toString('base64');
}
function headers(token, bodyLen) {
  const h = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'Content-Length': String(bodyLen),
    'X-WECHAT-UIN': randomUin(),
    'iLink-App-Id': APP_ID,
    'iLink-App-ClientVersion': String(buildClientVersionInt(CLIENT_VERSION)),
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function apiPost(endpoint, body, token, timeoutMs = 40000) {
  const payload = JSON.stringify(body);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(endpoint, BASE + '/'), {
      method: 'POST',
      headers: headers(token, Buffer.byteLength(payload, 'utf8')),
      body: payload,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return {}; }
  } finally {
    clearTimeout(t);
  }
}

async function getUpdates(token, buf) {
  try {
    const resp = await apiPost('ilink/bot/getupdates', {
      get_updates_buf: buf || '',
      base_info: { channel_version: CLIENT_VERSION },
    }, token, 40000);
    return resp;
  } catch (err) {
    if (err.name === 'AbortError') return { ret: 0, msgs: [], get_updates_buf: buf };
    throw err;
  }
}

async function sendReply(token, to, contextToken, text) {
  await apiPost('ilink/bot/sendmessage', {
    msg: {
      from_user_id: '',
      to_user_id: to,
      client_id: `dsh-r-${crypto.randomBytes(8).toString('hex')}`,
      message_type: 2,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text } }],
      context_token: contextToken || undefined,
    },
    base_info: { channel_version: CLIENT_VERSION },
  }, token, 15000);
}

function extractText(msg) {
  const items = msg.item_list || [];
  return items
    .filter((i) => i.type === 1 && i.text_item && i.text_item.text)
    .map((i) => i.text_item.text)
    .join('\n')
    .trim();
}

function runHeadless(prompt, sessionId) {
  return new Promise((resolve) => {
    const env = { ...process.env, DSH_HEADLESS_SESSION_ID: sessionId };
    if (!env.PATH) env.PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
    const child = spawn(DSH_BIN, ['--profile', 'headless', prompt], {
      cwd: DSH_CWD,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let errOut = '';
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve('⏱️ 任务超时（15 分钟）已终止');
    }, TASK_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; if (out.length > 1e6) out = out.slice(-1e6); });
    child.stderr.on('data', (d) => { errOut += d; if (errOut.length > 1e5) errOut = errOut.slice(-1e5); });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      const body = (out + (code === 0 ? '' : `\n[exit ${code}] ${errOut}`)).trim();
      resolve(body || '(无输出)');
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve(`任务启动失败: ${err.message}`);
    });
  });
}

function systemNotify(title, message) {
  spawn(DSH_NOTIFY_BIN, [title, message], { stdio: 'ignore' });
}

// Attach the bridge session to its workspace via the web server's RPC API
// (single-writer registry, race-free). Idempotent.
async function webRpc(method, payload) {
  const res = await fetch(`${DSH_WEB_URL}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: DSH_WEB_URL },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `dsh-wechat-${crypto.randomUUID()}`,
      method,
      payload,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function attachToWorkspace(sessionId) {
  try {
    const list = await webRpc('workspace.list', {});
    let ws = (list?.result?.ok ? list.result.value.items : []).find((w) => w.path === DSH_CWD);
    if (!ws) {
      const created = await webRpc('workspace.create', { path: DSH_CWD });
      ws = created?.result?.ok ? created.result.value.workspace : undefined;
    }
    if (!ws) throw new Error('workspace not found or not created');
    const attached = await webRpc('session.create', { sessionId, workspaceId: ws.workspaceId });
    if (!attached?.result?.ok) throw new Error(JSON.stringify(attached?.result).slice(0, 120));
    log(`attached ${sessionId} to workspace "${ws.title}"`);
  } catch (err) {
    log(`workspace attach failed: ${err.message}`);
  }
}

function resetMemory(state) {
  // delete the persisted headless session dir so the next message starts fresh
  try {
    const entries = fs.readdirSync(DSH_SESSIONS_DIR);
    const escaped = state.sessionId.replace(/[^A-Za-z0-9-]/g, '');
    for (const e of entries) {
      if (e.includes(escaped)) {
        fs.rmSync(path.join(DSH_SESSIONS_DIR, e), { recursive: true, force: true });
      }
    }
  } catch (err) {
    log(`memory reset cleanup: ${err.message}`);
  }
  state.sessionId = `session-wechat-${crypto.randomUUID().slice(0, 8)}`;
  state.lastSeq = 0;
  saveState(state);
  return state.sessionId;
}

async function processMessage(token, creds, msg, seq, state) {
  const text = extractText(msg);
  if (!text) return;
  log(`task from user: ${text.slice(0, 120)}`);

  if (/^(清空|重置|清除)(记忆|会话|上下文)/.test(text.trim())) {
    resetMemory(state);
    try { await sendReply(token, msg.from_user_id, msg.context_token, '🤖 记忆已清空，从现在开始是新会话。'); } catch {}
    return;
  }

  await sendReply(token, msg.from_user_id, msg.context_token, '🤖 收到，处理中…').catch(() => {});
  const result = await runHeadless(text, state.sessionId);
  await attachToWorkspace(state.sessionId); // make it visible in the WebUI sidebar
  const reply = `🤖 ${result.slice(0, MAX_REPLY_CHARS)}${result.length > MAX_REPLY_CHARS ? '\n…(已截断)' : ''}`;
  try {
    await sendReply(token, msg.from_user_id, msg.context_token, reply);
    log(`replied (seq=${seq})`);
  } catch (err) {
    log(`reply failed: ${err.message}`);
  }
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  log(`daemon starting (dsh=${DSH_BIN}, cwd=${DSH_CWD})`);

  let creds;
  try {
    creds = loadCreds();
    if (!creds.bot_token || !creds.ilink_user_id) throw new Error('missing fields');
  } catch {
    log('not logged in yet; waiting for dsh-wechat login');
    await new Promise((r) => setTimeout(r, 60_000));
    return main();
  }

  const state = loadState();
  log(`allowlist: ${creds.ilink_user_id.slice(0, 8)}…`);

  let backoff = 1000;
  while (true) {
    try {
      const resp = await getUpdates(creds.bot_token, state.get_updates_buf);
      if (resp && typeof resp.ret === 'number' && resp.ret !== 0) {
        const err = `getupdates ret=${resp.ret}`;
        log(err);
        if (resp.ret === -14) {
          systemNotify('DeepSeek Harness', '微信 bot 会话已过期，重新运行 dsh-wechat login 扫码即可');
        }
        backoff = 60_000;
      } else {
        backoff = 1000;
        if (resp && resp.get_updates_buf !== undefined) {
          state.get_updates_buf = resp.get_updates_buf;
          saveState(state);
        }
        const msgs = (resp && resp.msgs) || [];
        for (const msg of msgs) {
          const seq = msg.seq ?? 0;
          if (seq && seq <= state.lastSeq) continue;
          if (seq) state.lastSeq = Math.max(state.lastSeq, seq);
          saveState(state);

          const fresh = !msg.create_time_ms || (Date.now() - msg.create_time_ms) < 5 * 60_000;
          const allowed = msg.from_user_id === creds.ilink_user_id;
          const isUserMsg = msg.message_type === 1 && !msg.delete_time_ms;
          if (fresh && allowed && isUserMsg) {
            await processMessage(creds.bot_token, creds, msg, seq, state);
          } else if (allowed === false && isUserMsg && fresh) {
            log(`ignored message from unauthorized sender`);
          }
        }
      }
    } catch (err) {
      log(`poll error: ${err.message}`);
      backoff = 10_000;
    }
    await new Promise((r) => setTimeout(r, backoff));
  }
}

main();
