#!/usr/bin/env node
/**
 * vision-bridge v0.1.0 — 给无视觉文本模型桥接看图能力的 CLI
 *
 * Vendored from JochenYang/luma-mcp vision-skill (MIT License, Copyright (c) 2025 Jochen),
 * adapted: provider 预置 + 配置文件路由、task modes、sips 大图降采样、429/5xx 重试、
 * --list / --dry-run / --json、ui 模式输出 0-1000 归一化坐标。
 *
 * 用法:
 *   node vision.mjs <图片路径|URL|dataURI|-> "<问题>" [--mode auto|general|ocr|ui|debug|describe] [--provider ...]
 *   node vision.mjs --list
 */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, extname, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CONFIG_PATH =
  process.env.VISION_BRIDGE_CONFIG ||
  join(homedir(), ".config", "vision-bridge", "config.json");

const PROVIDER_PRESETS = {
  dashscope: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3-vl-flash", label: "阿里云百炼 DashScope · Qwen3-VL-Flash（限免 50 万 token，OCR/UI 强）" },
  siliconflow: { baseURL: "https://api.siliconflow.cn/v1", model: "deepseek-ai/deepseek-ocr", label: "硅基流动 · DeepSeek-OCR（免费档，纯 OCR）" },
  zhipu: { baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.6v", label: "智谱 · GLM-4.6V（按量计费，通用视觉）" },
  minimax: { baseURL: "https://api.minimaxi.com/v1", model: "MiniMax-VL-01", label: "MiniMax · MiniMax-VL-01（按量计费）" },
  custom: { baseURL: "", model: "", label: "自定义 OpenAI 兼容端点" },
};

const DEFAULT_PROVIDER_ORDER = ["dashscope", "siliconflow", "zhipu", "minimax", "custom"];

const MIME_MAP = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const TASK_SUFFIX = {
  ocr: [
    "Task focus: OCR / text extraction.",
    "Transcribe visible text accurately; preserve structure (lines, tables, code indentation) when possible.",
    "If text is unreadable, mark it as [illegible]. Do not invent missing characters.",
    "Output the extracted text only, without commentary.",
  ],
  ui: [
    "Task focus: UI / layout structure.",
    "Describe hierarchy (regions, components), spatial relationships, interactive elements, and notable visual states.",
    "Prefer relative layout terms over pixel coordinates.",
    "For each notable interactive element (buttons, inputs, links, tabs, menus), append exactly one coordinate line in the format: <|box_start|>(x1,y1),(x2,y2)<|box_end|>",
    "Coordinates are integers normalized to 0-1000, relative to full image width and height, with x1<x2 and y1<y2; the box must cover the whole element.",
  ],
  debug: [
    "Task focus: debugging from a screenshot (errors, stack traces, logs, broken UI).",
    "Extract error messages and stack traces verbatim when present.",
    "Summarize likely failure point and actionable next checks without inventing stack frames.",
  ],
  describe: [
    "Task focus: concise visual description.",
    "State image type, main subject, and key visible facts. Stay brief unless the user asks for depth.",
  ],
};

const AUTO_ROUTES = [
  [/ocr|extract|文字|文本|转写|抄|识别文字/i, "ocr"],
  [/error|stack|trace|报错|错误|日志|exception/i, "debug"],
  [/ui|layout|界面|布局|组件|按钮|控件|坐标|element/i, "ui"],
  [/描述|describe|这是什么|图片内容/i, "describe"],
];

function parseArgs(argv) {
  const a = { mode: "auto", provider: "auto", image: "", prompt: "", json: false, dryRun: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--help" || v === "-h") a.help = true;
    else if (v === "--mode") a.mode = argv[++i] || "auto";
    else if (v === "--provider") a.provider = argv[++i] || "auto";
    else if (v === "--json") a.json = true;
    else if (v === "--dry-run") a.dryRun = true;
    else if (v === "--list") a.list = true;
    else if (!v.startsWith("--")) {
      if (!a.image) a.image = v;
      else a.prompt = a.prompt ? a.prompt + " " + v : v;
    }
  }
  return a;
}

const USAGE = `vision-bridge — image understanding for text-only models
用法:
  node vision.mjs <图片> "<问题>" [--mode auto|general|ocr|ui|debug|describe] [--provider ...] [--json] [--dry-run]
  node vision.mjs --list
图片: 本地路径 | http(s) URL | data:image URI | - (自动找缓存目录最新图)
配置: ${CONFIG_PATH}（权限 0600，apiKey 填在里面）
`;

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `视觉功能未配置（缺 ${CONFIG_PATH}）。\n` +
      `配置方法：打开「DSH 装备版」App 菜单 → 文件 → 配置视觉模型…，粘贴视觉 API key 即可；\n` +
      `或手动: cp ~/.agents/skills/vision-bridge/config.example.json ${CONFIG_PATH} 并填入 apiKey`
    );
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    throw new Error(`配置文件解析失败: ${e.message}`);
  }
}

function mergedProviders(cfg) {
  const out = {};
  const raw = cfg?.providers || {};
  for (const [name, preset] of Object.entries(PROVIDER_PRESETS)) {
    out[name] = { ...preset, ...(raw[name] || {}) };
  }
  return out;
}

function resolveProvider(cfg, want) {
  const providers = mergedProviders(cfg);
  if (want && want !== "auto") {
    const p = providers[want];
    if (!p) throw new Error(`未知 provider: ${want}（可用: ${Object.keys(providers).join(", ")}）`);
    if (want === "custom") {
      if (!p.apiKey || !p.baseURL || !p.model) throw new Error('provider "custom" 需要 apiKey、baseURL、model 三项');
      return { name: want, ...p };
    }
    if (!p.apiKey) throw new Error(
      `视觉功能未配置：provider "${want}" 没有 apiKey（${CONFIG_PATH}）。\n` +
      `打开「DSH 装备版」App 菜单 → 文件 → 配置视觉模型…，粘贴 key 即可`
    );
    return { name: want, ...p };
  }
  const order = cfg.providerOrder || DEFAULT_PROVIDER_ORDER;
  for (const name of order) {
    const p = providers[name];
    if (!p) continue;
    if (name === "custom") {
      if (p.apiKey && p.baseURL && p.model) return { name, ...p };
    } else if (p.apiKey) return { name, ...p };
  }
  throw new Error(
    `没有任何 provider 配置了 apiKey。请编辑 ${CONFIG_PATH} 填入一个 key。\n` +
    `推荐: 阿里云百炼控制台创建 API Key 并激活 qwen3-vl-flash（送 50 万 token 限免额度）`
  );
}

function resolveMode(mode, prompt) {
  if (mode && mode !== "auto") return mode;
  for (const [re, m] of AUTO_ROUTES) {
    if (re.test(prompt)) return m;
  }
  return "general";
}

function buildPrompt(mode, userPrompt) {
  const lines = [
    "You are a precise vision assistant. Analyze the attached image and fulfill the request below. Reply in the same language as the request. Never invent content that is not visible in the image.",
  ];
  if (userPrompt) lines.push(`User request: ${userPrompt}`);
  const suffix = TASK_SUFFIX[mode];
  if (suffix) lines.push(suffix.join("\n"));
  return lines.join("\n\n");
}

function isDataUri(s) {
  return typeof s === "string" && s.startsWith("data:") && s.includes(";base64,");
}
function isUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function findLatestCachedImage() {
  const dirs = [
    join(homedir(), ".claude", "cache"),
    join(homedir(), ".kimi-code", "cache"),
    tmpdir(),
  ];
  let best = null;
  let bestTime = 0;
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    try {
      for (const f of readdirSync(d)) {
        if (!IMAGE_EXTENSIONS.has(extname(f).toLowerCase())) continue;
        const p = join(d, f);
        const st = statSync(p);
        if (st.isFile() && st.mtimeMs > bestTime) {
          bestTime = st.mtimeMs;
          best = p;
        }
      }
    } catch {
      /* 跳过无权限目录 */
    }
  }
  return best;
}

function mimeOf(path) {
  return MIME_MAP[path.toLowerCase().split(".").pop()] || "image/png";
}

function downscaleIfNeeded(imagePath, buffer) {
  const cap = 4500000;
  if (buffer.length <= cap) return { buffer, mime: mimeOf(imagePath), resized: false };
  try {
    const out = join(tmpdir(), `vision-bridge-${Date.now()}.jpg`);
    execFileSync("sips", ["-Z", "2000", "-s", "format", "jpeg", "-s", "formatOptions", "85", imagePath, "--out", out], { stdio: "ignore", timeout: 60000 });
    const resized = readFileSync(out);
    return { buffer: resized, mime: "image/jpeg", resized: true };
  } catch {
    return { buffer, mime: mimeOf(imagePath), resized: false };
  }
}

async function loadImage(source) {
  if (isDataUri(source)) {
    const m = source.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) throw new Error("无效 Data URI");
    return { buffer: Buffer.from(m[2], "base64"), mime: m[1].toLowerCase(), resized: false };
  }
  if (isUrl(source)) {
    const resp = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new Error(`远程图片拉取失败 (${resp.status})`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    return { buffer, mime: (resp.headers.get("content-type") || "").split(";")[0] || "image/png", resized: false };
  }
  const p = source.startsWith("@") ? source.slice(1) : source;
  const imagePath = resolve(p);
  if (existsSync(imagePath)) {
    const buffer = readFileSync(imagePath);
    return downscaleIfNeeded(imagePath, buffer);
  }
  if (!source || source === "-") {
    const found = findLatestCachedImage();
    if (found) return downscaleIfNeeded(found, readFileSync(found));
    throw new Error("找不到图片文件，请指定路径");
  }
  throw new Error(`图片文件不存在: ${imagePath}`);
}

async function callVision(provider, prompt, image) {
  const url = `${provider.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const body = JSON.stringify({
    model: provider.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.buffer.toString("base64")}` } },
        ],
      },
    ],
    max_tokens: 4096,
    stream: false,
  });
  const started = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(180000),
      });
      if (!resp.ok) {
        const errText = (await resp.text().catch(() => "")).slice(0, 500);
        lastErr = new Error(`API ${resp.status}: ${errText}`);
        if (resp.status === 429 || resp.status >= 500) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw lastErr;
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("API 返回异常: 缺少 choices[0].message.content");
      return { text: content, ms: Date.now() - started };
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") lastErr = new Error("请求超时 (180s)");
      else lastErr = e;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error("未知错误");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const cfg = loadConfig();
  const providers = mergedProviders(cfg);

  if (args.list) {
    console.log(`providers（key 状态）— 配置: ${CONFIG_PATH}`);
    for (const name of DEFAULT_PROVIDER_ORDER) {
      const p = providers[name];
      const has = name === "custom" ? !!(p.apiKey && p.baseURL && p.model) : !!p.apiKey;
      console.log(`- ${name.padEnd(12)} ${has ? "已配置" : "未配置"}  ${p.label}`);
    }
    return;
  }

  if (!args.image) {
    console.error(USAGE);
    process.exit(1);
  }

  const provider = resolveProvider(cfg, args.provider);
  const mode = resolveMode(args.mode, args.prompt);
  const prompt = buildPrompt(mode, args.prompt);
  const image = await loadImage(args.image);

  if (args.dryRun) {
    console.log(JSON.stringify({
      provider: provider.name,
      model: provider.model,
      mode,
      imageBytes: image.buffer.length,
      imageMime: image.mime,
      resized: image.resized,
      prompt,
    }, null, 2));
    return;
  }

  const { text, ms } = await callVision(provider, prompt, image);

  if (args.json) {
    console.log(JSON.stringify({ provider: provider.name, model: provider.model, mode, imageBytes: image.buffer.length, ms, text }));
  } else {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(`错误: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
