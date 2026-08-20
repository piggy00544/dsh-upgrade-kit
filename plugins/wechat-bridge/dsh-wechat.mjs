#!/usr/bin/env node
// dsh-wechat — zero-dependency direct client for the WeChat iLink bot API
// (https://ilinkai.weixin.qq.com). Speaks the official WeChat bot interface
// directly; no OpenClaw, no gateway, no relay.
//
// Usage:
//   dsh-wechat login            start QR login (writes QR URL to /tmp/dsh-wechat-qr-url.txt)
//   dsh-wechat send 标题 内容    send a text message to the logged-in user
//   dsh-wechat status           show credential freshness
//   dsh-wechat --check          {"configured":true|false} for wrapper scripts
//
// Credentials: ~/.local/share/dsh-wechat/credentials.json (0600)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const BASE = 'https://ilinkai.weixin.qq.com';
const BOT_TYPE = '3';
const APP_ID = 'bot';
const CLIENT_VERSION = '2.1.6'; // mirror the official channel client version
const STATE_DIR = path.join(os.homedir(), '.local', 'share', 'dsh-wechat');
const CREDS = path.join(STATE_DIR, 'credentials.json');
const QR_URL_FILE = '/tmp/dsh-wechat-qr-url.txt';
const LOG_FILE = '/tmp/dsh-wechat.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function buildClientVersionInt(v) {
  const [a = 0, b = 0, c = 0] = v.split('.').map((n) => parseInt(n, 10) || 0);
  return ((a & 0xff) << 16) | ((b & 0xff) << 8) | (c & 0xff);
}

function commonHeaders() {
  return {
    'iLink-App-Id': APP_ID,
    'iLink-App-ClientVersion': String(buildClientVersionInt(CLIENT_VERSION)),
  };
}

function randomUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

async function apiGet(endpoint, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(endpoint, BASE + '/'), {
      method: 'GET',
      headers: commonHeaders(),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GET ${endpoint} -> ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

async function apiPost(endpoint, body, token, timeoutMs = 15000) {
  const payload = JSON.stringify(body);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'Content-Length': String(Buffer.byteLength(payload, 'utf-8')),
    'X-WECHAT-UIN': randomUin(),
    ...commonHeaders(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(new URL(endpoint, BASE + '/'), {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST ${endpoint} -> ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return {}; }
  } finally {
    clearTimeout(t);
  }
}

function saveCreds(creds) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CREDS, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

function loadCreds() {
  const raw = fs.readFileSync(CREDS, 'utf8');
  return JSON.parse(raw);
}

// ---------------- login ----------------

async function fetchQR() {
  const resp = await apiGet(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`);
  if (!resp.qrcode || !resp.qrcode_img_content) {
    throw new Error('get_bot_qrcode response missing qrcode fields');
  }
  return resp;
}

async function pollStatus(qrcode, timeoutMs = 35000) {
  try {
    const resp = await apiGet(
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      timeoutMs,
    );
    return resp.status || 'wait';
  } catch {
    return 'wait'; // long-poll timeout / network error: keep polling
  }
}

async function runLogin() {
  let refreshCount = 0;
  const MAX_REFRESH = 40; // stay alive ~2h so the user can scan at leisure
  let qr = await fetchQR();
  log('QR obtained');

  fs.writeFileSync(QR_URL_FILE, qr.qrcode_img_content + '\n');
  console.log(`\n使用微信扫描二维码完成连接：\n${qr.qrcode_img_content}\n`);
  console.log('（二维码 PNG 会由本机 watcher 自动生成到工作区 wechat-login-qr.png）\n等待扫码...');

  const deadline = Date.now() + 2 * 60 * 60_000;
  while (Date.now() < deadline) {
    const status = await pollStatus(qr.qrcode);
    if (status === 'scaned') {
      console.log('👀 已扫码，请在手机上确认…');
    } else if (status === 'confirmed') {
      const full = await apiGet(
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr.qrcode)}`,
        5000,
      ).catch(() => null);
      if (!full || !full.bot_token || !full.ilink_bot_id) {
        console.log('⚠️ 确认成功但缺少令牌，重试中…');
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      const creds = {
        bot_token: full.bot_token,
        ilink_bot_id: full.ilink_bot_id,
        ilink_user_id: full.ilink_user_id || '',
        baseurl: full.baseurl || '',
        updated_at: new Date().toISOString(),
      };
      saveCreds(creds);
      log('login confirmed, credentials saved');
      console.log('\n✅ 微信直连登录成功！');
      console.log(`   bot_id: ${full.ilink_bot_id}`);
      console.log('   凭证已保存，现在可以直接发送消息。\n');
      try { fs.unlinkSync(QR_URL_FILE); } catch {}
      process.exit(0);
    } else if (status === 'expired') {
      refreshCount += 1;
      if (refreshCount > MAX_REFRESH) {
        console.error('\n登录超时：二维码多次过期，请重新运行 dsh-wechat login');
        process.exit(1);
      }
      console.log(`\n⏳ 二维码已过期，正在刷新...(${refreshCount}/${MAX_REFRESH})`);
      qr = await fetchQR();
      fs.writeFileSync(QR_URL_FILE, qr.qrcode_img_content + '\n');
      console.log(`🔄 新二维码：\n${qr.qrcode_img_content}\n`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('\n登录超时，请重试。');
  process.exit(1);
}

// ---------------- send ----------------

function buildTextReq(to, text) {
  return {
    msg: {
      from_user_id: '',
      to_user_id: to,
      client_id: `dsh-${crypto.randomBytes(8).toString('hex')}`,
      message_type: 2,   // BOT
      message_state: 2,  // FINISH
      item_list: [{ type: 1, text_item: { text } }], // TEXT
    },
    base_info: { channel_version: CLIENT_VERSION },
  };
}

async function runSend(title, message) {
  let creds;
  try {
    creds = loadCreds();
  } catch {
    console.error('未登录：先运行 dsh-wechat login 扫码登录。');
    process.exit(2);
  }
  if (!creds.bot_token) {
    console.error('凭证缺少 bot_token：请重新运行 dsh-wechat login。');
    process.exit(2);
  }
  const to = creds.ilink_user_id;
  if (!to) {
    console.error('凭证缺少 ilink_user_id：请重新运行 dsh-wechat login。');
    process.exit(2);
  }
  const text = title ? `【${title}】${message}` : message;
  try {
    await apiPost('ilink/bot/sendmessage', buildTextReq(to, text), creds.bot_token);
    log(`sent to ${to.slice(0, 8)}…`);
  } catch (err) {
    console.error(`发送失败: ${err.message}`);
    if (/401|errcode\s*-14|session/i.test(err.message)) {
      console.error('会话可能已过期，请重新运行 dsh-wechat login 扫码。');
    }
    process.exit(1);
  }
}

// ---------------- status / check ----------------

function runStatus() {
  try {
    const creds = loadCreds();
    const ageDays = (Date.now() - new Date(creds.updated_at || 0).getTime()) / 86400000;
    console.log(`configured: true`);
    console.log(`updated_at: ${creds.updated_at || 'unknown'} (${ageDays.toFixed(1)} 天前)`);
    console.log(`bot_id: ${creds.ilink_bot_id || 'unknown'}`);
    console.log(`ilink_user_id: ${creds.ilink_user_id ? creds.ilink_user_id.slice(0, 8) + '…' : 'unknown'}`);
  } catch {
    console.log('configured: false — 未登录');
    process.exit(1);
  }
}

function runCheck() {
  try {
    loadCreds();
    console.log('{"configured":true}');
  } catch {
    console.log('{"configured":false}');
    process.exit(1);
  }
}

// ---------------- gui helpers（App 向导页用，JSON 输出）----------------

async function runQr() {
  try {
    const qr = await fetchQR();
    console.log(JSON.stringify({
      ok: true,
      qrcode: qr.qrcode,
      img: qr.qrcode_img_content || '',
    }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}

// 确认后保存凭证（与 runLogin 相同逻辑）
async function confirmAndSave(qrcode) {
  const full = await apiGet(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    5000,
  );
  if (!full || !full.bot_token || !full.ilink_bot_id) return null;
  const creds = {
    bot_token: full.bot_token,
    ilink_bot_id: full.ilink_bot_id,
    ilink_user_id: full.ilink_user_id || '',
    baseurl: full.baseurl || '',
    updated_at: new Date().toISOString(),
  };
  saveCreds(creds);
  return creds;
}

async function runQrCheck(qrcode) {
  try {
    const status = await pollStatus(qrcode, 6000);
    if (status === 'confirmed') {
      const creds = await confirmAndSave(qrcode);
      if (creds) {
        console.log(JSON.stringify({ ok: true, status: 'confirmed', bot_id: creds.ilink_bot_id }));
        return;
      }
    }
    console.log(JSON.stringify({ ok: true, status }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, status: 'error', error: err.message }));
  }
}

// ---------------- main ----------------

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'login':
    runLogin();
    break;
  case 'qr':
    runQr();
    break;
  case 'check': {
    if (rest.length >= 1) runQrCheck(rest[0]);
    else { console.error('usage: dsh-wechat check <qrcode>'); process.exit(2); }
    break;
  }
  case 'send': {
    if (rest.length >= 2) runSend(rest[0], rest.slice(1).join(' '));
    else if (rest.length === 1) runSend('', rest[0]);
    else { console.error('usage: dsh-wechat send [标题] 内容'); process.exit(2); }
    break;
  }
  case 'status':
    runStatus();
    break;
  case '--check':
    runCheck();
    break;
  default:
    console.error('usage: dsh-wechat {login|qr|check|send|status|--check}');
    process.exit(2);
}
