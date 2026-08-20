/**
 * @deepseek-ai/dsh-cost — host half: 用量台账 + 峰谷计价 + DeepSeek 余额代理。
 * 纯 Node 内置模块实现，零外部依赖（profile node_modules 本地插件）。
 * 数据源：$DSH_HOME/sessions/<cwd>/<session>/session.jsonl.zstd 的 assistant/message 事件。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const name = "dsh-cost";
export const inject = ["webServer"];
export { buildSummary, SCHEDULE };

const BASE = "/api/dsh-cost";
const HOUR_MS = 3600_000;

// ---------------------------------------------------------------------------
// 价格表（元/百万 token；美元官方价单独列）。生效区间按北京时间。
// 来源：api-docs.deepseek.com/quick_start/pricing + 2026-08-17 峰谷定价公告。
// 高峰：北京时间 9:00–12:00、14:00–18:00（UTC 01–04、06–10）；其余低峰，低峰=高峰半价。
// ---------------------------------------------------------------------------
const t8 = (s) => Date.parse(s + "+08:00");
const SCHEDULE = [
  {
    model: "deepseek-v4-pro",
    from: t8("2026-08-12T00:00:00"), to: t8("2026-08-17T00:00:00"),
    label: "V4-Pro 初始定价（8/12 发布）",
    flat: { hit: 0.025, miss: 3.0, out: 6.0 },
    usd: null
  },
  {
    model: "deepseek-v4-pro",
    from: t8("2026-08-17T00:00:00"), to: Infinity,
    label: "V4-Pro 峰谷定价（8/17 起）",
    peak: { hit: 0.30, miss: 9.0, out: 27.0 },
    off: { hit: 0.15, miss: 4.5, out: 13.5 },
    usd: { peak: { hit: 0.044, miss: 1.32, out: 3.96 }, off: { hit: 0.022, miss: 0.66, out: 1.98 } }
  },
  {
    model: "deepseek-v4-flash",
    from: t8("2026-08-17T00:00:00"), to: Infinity,
    label: "V4-Flash 峰谷定价（8/17 起）",
    peak: { hit: 0.10, miss: 3.0, out: 9.0 },
    off: { hit: 0.05, miss: 1.5, out: 4.5 },
    usd: { peak: { hit: 0.014, miss: 0.44, out: 1.32 }, off: { hit: 0.007, miss: 0.22, out: 0.66 } }
  },
  {
    model: "deepseek-v4-flash",
    from: t8("2026-07-31T00:00:00"), to: t8("2026-08-17T00:00:00"),
    label: "V4-Flash 8/17 前（价格未公布，只计 token）",
    unpriced: true
  }
];

function priceFor(model, timeMs) {
  const entry = SCHEDULE.find((s) => s.model === model && timeMs >= s.from && timeMs < s.to);
  if (!entry || entry.unpriced) return null;
  return entry;
}

/** 北京时间小时（中国无夏令时，固定 +8）。 */
function bjtHour(timeMs) {
  return Math.floor(((timeMs / 1000) % 86400 + 8 * 3600) / 3600) % 24;
}

function isPeakHour(h) {
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

/** 一条调用 → {rmb, usd, peak} ；无法计价返回 null。 */
function costOf(rec) {
  const entry = priceFor(rec.model, rec.time);
  if (!entry) return null;
  const h = bjtHour(rec.time);
  const peak = isPeakHour(h);
  let rmbPrice;
  let usdPrice;
  if (entry.flat) {
    rmbPrice = entry.flat;
    usdPrice = entry.usd ?? null;
  } else {
    rmbPrice = peak ? entry.peak : entry.off;
    usdPrice = peak ? entry.usd.peak : entry.usd.off;
  }
  const rmb = (rec.cr * rmbPrice.hit + rec.in * rmbPrice.miss + rec.out * rmbPrice.out) / 1e6;
  const usd = usdPrice
    ? (rec.cr * usdPrice.hit + rec.in * usdPrice.miss + rec.out * usdPrice.out) / 1e6
    : null;
  return { rmb, usd, peak };
}

// ---------------------------------------------------------------------------
// 台账：扫描全部会话日志，按 (文件, 大小+mtime) 缓存
// ---------------------------------------------------------------------------
const fileCache = new Map(); // file -> { sig, records, title, cwd, createdAt }

function dshHome() {
  return (
    process.env.DSH_HOME ||
    join(process.env.HOME, "Library", "Application Support", "DeepSeek Harness Lab", "home")
  );
}

function sessionFiles() {
  const root = join(dshHome(), "sessions");
  if (!existsSync(root)) return [];
  const files = [];
  for (const cwdDir of readdirSync(root)) {
    const cwdPath = join(root, cwdDir);
    let st;
    try {
      st = statSync(cwdPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const s of readdirSync(cwdPath)) {
      const f = join(cwdPath, s, "session.jsonl.zstd");
      if (existsSync(f)) files.push(f);
    }
  }
  return files;
}

function parseSessionFile(f) {
  let text;
  try {
    text = execFileSync("zstd", ["-dc", f], { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");
  } catch {
    return { records: [], title: null, cwd: null, createdAt: null };
  }
  const records = [];
  let title = null;
  let cwd = null;
  let createdAt = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "assistant/message" && e.time && e.data && e.data.usage) {
      const src = (e.data.message && e.data.message.source) || {};
      const u = e.data.usage;
      records.push({
        time: e.time,
        model: src.model || "unknown",
        provider: src.provider || "unknown",
        in: u.inputTokens || 0,
        out: u.outputTokens || 0,
        cr: u.cacheReadTokens || 0,
        cw: u.cacheWriteTokens || 0,
        turn: e.data.turn,
        step: e.data.step
      });
    } else if (e.type === "session/title" && e.data && e.data.title) {
      title = e.data.title;
    } else if (e.type === "session") {
      cwd = e.cwd;
      createdAt = e.createdAt;
    }
  }
  return { records, title, cwd, createdAt };
}

function scanLedger() {
  const entries = [];
  for (const f of sessionFiles()) {
    let st;
    try {
      st = statSync(f);
    } catch {
      continue;
    }
    const sig = `${st.size}:${st.mtimeMs}`;
    const prev = fileCache.get(f);
    if (!prev || prev.sig !== sig) {
      fileCache.set(f, { sig, ...parseSessionFile(f) });
    }
    entries.push({ file: f, ...fileCache.get(f) });
  }
  return entries;
}

function sumTokens(list) {
  const t = { in: 0, out: 0, cr: 0, cw: 0 };
  for (const r of list) {
    t.in += r.in;
    t.out += r.out;
    t.cr += r.cr;
    t.cw += r.cw;
  }
  return t;
}

function buildSummary() {
  const entries = scanLedger();
  const all = [];
  for (const en of entries) all.push(...en.records);

  const byModel = new Map();
  const byDay = new Map();
  const byHour = new Map();
  const peakSplit = { peakRmb: 0, offRmb: 0, peakUsd: 0, offUsd: 0 };
  let rmbTotal = 0;
  let usdTotal = 0;
  let unpriced = 0;
  let priced = 0;

  for (const rec of all) {
    const cost = costOf(rec);
    const day = new Date(rec.time + 8 * HOUR_MS).toISOString().slice(0, 10);
    const h = bjtHour(rec.time);

    const m = byModel.get(rec.model) || {
      model: rec.model, rmb: 0, usd: null, usdAccum: 0, priced: true, calls: 0, tokens: { in: 0, out: 0, cr: 0, cw: 0 }
    };
    m.calls += 1;
    m.tokens.in += rec.in;
    m.tokens.out += rec.out;
    m.tokens.cr += rec.cr;
    m.tokens.cw += rec.cw;

    const d = byDay.get(day) || { date: day, rmb: 0, usd: 0, usdPriced: true, tokens: { in: 0, out: 0, cr: 0, cw: 0 }, calls: 0 };
    d.calls += 1;
    d.tokens.in += rec.in;
    d.tokens.out += rec.out;
    d.tokens.cr += rec.cr;
    d.tokens.cw += rec.cw;

    const hh = byHour.get(h) || { h, rmb: 0, usd: 0, peak: isPeakHour(h), tokens: 0 };
    hh.tokens += rec.out;

    if (cost) {
      priced += 1;
      rmbTotal += cost.rmb;
      m.rmb += cost.rmb;
      d.rmb += cost.rmb;
      hh.rmb += cost.rmb;
      if (cost.usd != null) {
        usdTotal += cost.usd;
        m.usdAccum += cost.usd;
        d.usd += cost.usd;
        hh.usd += cost.usd;
      } else {
        d.usdPriced = false;
        m.priced = false;
      }
      if (cost.peak) {
        peakSplit.peakRmb += cost.rmb;
        if (cost.usd != null) peakSplit.peakUsd += cost.usd;
      } else {
        peakSplit.offRmb += cost.rmb;
        if (cost.usd != null) peakSplit.offUsd += cost.usd;
      }
    } else {
      unpriced += 1;
    }
    byModel.set(rec.model, m);
    byDay.set(day, d);
    byHour.set(h, hh);
  }

  const modelRows = [...byModel.values()]
    .map((m) => ({ ...m, usd: m.priced ? m.usdAccum : null }))
    .sort((a, b) => b.rmb - a.rmb);

  const dayRows = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  const hourRows = [];
  for (let h = 0; h < 24; h++) hourRows.push(byHour.get(h) || { h, rmb: 0, usd: 0, peak: isPeakHour(h), tokens: 0 });

  const sessionRows = entries
    .map((en) => {
      const cost = { rmb: 0, usd: null, priced: true };
      let usdAccum = 0;
      for (const rec of en.records) {
        const c = costOf(rec);
        if (c) {
          cost.rmb += c.rmb;
          if (c.usd != null) usdAccum += c.usd;
          else cost.priced = false;
        }
      }
      return {
        id: en.file.split("/").slice(-2)[0],
        title: en.title,
        cwd: en.cwd,
        createdAt: en.createdAt,
        rmb: cost.rmb,
        usd: cost.priced ? usdAccum : null,
        tokens: sumTokens(en.records),
        calls: en.records.length
      };
    })
    .sort((a, b) => b.rmb - a.rmb);

  return {
    generatedAt: Date.now(),
    currency: { primary: "CNY", secondary: "USD", rate: 7.2 },
    totals: {
      rmb: rmbTotal,
      usd: usdTotal,
      tokens: sumTokens(all),
      calls: all.length,
      pricedCalls: priced,
      unpricedCalls: unpriced
    },
    peakSplit,
    byModel: modelRows,
    days: dayRows,
    hours: hourRows,
    sessions: sessionRows
  };
}

// ---------------------------------------------------------------------------
// 余额：官方接口 https://api.deepseek.com/user/balance（60s 缓存）
// ---------------------------------------------------------------------------
let balanceCache = { at: 0, data: null };

function apiKeyFromYaml() {
  try {
    const txt = readFileSync(join(dshHome(), ".credentials.yaml"), "utf8");
    const m = txt.match(/^DEEPSEEK_API_KEY:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function fetchBalance(force) {
  if (!force && balanceCache.data && Date.now() - balanceCache.at < 60_000) {
    return balanceCache.data;
  }
  const key = process.env.DEEPSEEK_API_KEY || apiKeyFromYaml();
  if (!key) return { error: "no-key" };
  try {
    const resp = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!resp.ok) return { error: `http-${resp.status}` };
    const data = await resp.json();
    balanceCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// HTTP 路由（挂在 webServer 上，/api/dsh-cost/*）
// ---------------------------------------------------------------------------
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: BASE,
        handler: async (req, res) => {
          const send = (obj, status = 200) => {
            res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(obj));
          };
          const host = String(req.headers.host || "");
          if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) {
            send({ error: "forbidden" }, 403);
            return;
          }
          const pathname = new URL(req.url ?? "/", "http://x").pathname;
          try {
            if (pathname === `${BASE}/summary`) send(buildSummary());
            else if (pathname === `${BASE}/balance`) send({ balance: { at: Date.now(), data: await fetchBalance(false) } });
            else if (pathname === `${BASE}/balance/refresh`) send({ balance: { at: Date.now(), data: await fetchBalance(true) } });
            else if (pathname === `${BASE}/prices`) {
              const publicSchedule = SCHEDULE.map((s) => ({
                model: s.model,
                from: s.from === Infinity ? null : new Date(s.from).toISOString(),
                to: s.to === Infinity ? null : new Date(s.to).toISOString(),
                label: s.label,
                peak: s.peak || null,
                off: s.off || null,
                flat: s.flat || null,
                usd: s.usd || null,
                unpriced: !!s.unpriced
              }));
              send({ peakHours: "北京时间 9:00–12:00、14:00–18:00 为高峰；其余低峰（官方文档未注明周末豁免）", schedule: publicSchedule });
            } else send({ error: "not found" }, 404);
          } catch (err) {
            send({ error: String(err && err.message ? err.message : err) }, 500);
          }
        }
      }),
    "dsh-cost: /api/dsh-cost route"
  );
}
