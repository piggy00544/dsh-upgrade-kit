#!/usr/bin/env node
/**
 * dsh-research-mcp v0.2 — DSH 的 Deep Research 增强服务器
 *
 * 工具（注册后对外名称为 mcp__research__*）：
 *   search     — 多引擎国际检索：
 *                 ddg    通用网搜（DuckDuckGo html，带重试 + lite 兜底，走代理）
 *                 hn     Hacker News（Algolia 官方 JSON API，AI 前沿话题金矿）
 *                 arxiv  arXiv 论文（官方 Atom API，标题+摘要）
 *                 github GitHub 仓库搜索（官方 API，按 star 排序）
 *                 bing   必应（地理重定向飘忽，默认不启用，显式指定才跑）
 *   fetch      — 抓取网页全文并抽取正文（走代理，静态层优先）
 *   site_hint  — 读取 web-access 共享库的站点经验
 *
 * 设计原则：
 *   - 零云 API key：垂直引擎全部走官方公开接口，DDG 走 html 解析
 *   - 代理感知：undici EnvHttpProxyAgent 自动读 HTTP_PROXY / HTTPS_PROXY
 *   - 单引擎失败不影响整体：每引擎独立 try/catch，错误显式报告
 *   - 礼貌限速：引擎串行 + 250ms 间隔，避免代理出口 IP 被风控
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

setGlobalDispatcher(new EnvHttpProxyAgent());

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SEARCH_TIMEOUT = 20000;
const FETCH_TIMEOUT = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP ────────────────────────────────────────────────────────────────────
async function httpGet(url, { headers = {}, timeout = FETCH_TIMEOUT } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** 瞬时错误（限流/502/超时）重试 attempts 次，指数退避。 */
async function withRetry(fn, attempts = 2, baseDelay = 1500) {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts) await sleep(baseDelay * 2 ** i);
    }
  }
  throw lastErr;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// ── DuckDuckGo html ─────────────────────────────────────────────────────────
function decodeDdgHref(href) {
  const m = href.match(/uddg=([^&"]+)/);
  if (!m) return href;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

async function ddgSearch(query, count) {
  return withRetry(async () => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
    const html = await httpGet(url, { timeout: SEARCH_TIMEOUT });
    if (!html.includes('result__a')) {
      // lite 兜底
      const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const liteHtml = await httpGet(liteUrl, { timeout: SEARCH_TIMEOUT });
      const links = [...liteHtml.matchAll(/<a[^>]*class=['"]result-link['"][^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      const out = links.map((m) => ({
        title: stripTags(m[2]) || m[1],
        url: decodeEntities(m[1]).replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, ''),
        snippet: '',
        engine: 'ddg-lite',
      })).filter((r) => /^https?:/.test(r.url) && !r.url.includes('duckduckgo.com')).slice(0, count);
      if (!out.length) throw new Error('ddg: no results (html anomaly + lite empty)');
      return out;
    }
    const anchors = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const snippets = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
    const out = [];
    for (let i = 0; i < anchors.length && out.length < count; i++) {
      const urlDecoded = decodeDdgHref(decodeEntities(anchors[i][1]));
      if (!urlDecoded || urlDecoded.includes('duckduckgo.com') || !/^https?:/.test(urlDecoded)) continue;
      out.push({
        title: stripTags(anchors[i][2]) || urlDecoded,
        url: urlDecoded,
        snippet: snippets[i] ? stripTags(snippets[i][1]) : '',
        engine: 'ddg',
      });
    }
    if (!out.length) throw new Error('ddg: no results parsed');
    return out;
  }, 2, 1500);
}

// ── Hacker News（Algolia 官方 API）──────────────────────────────────────────
async function hnSearch(query, count) {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${Math.min(count, 20)}&tags=story`;
  const body = await httpGet(url, { timeout: SEARCH_TIMEOUT });
  const data = JSON.parse(body);
  const out = (data.hits || []).map((h) => ({
    title: h.title || stripTags(h.story_text || '').slice(0, 80) || 'HN thread',
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    snippet: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments · ${String(h.created_at).slice(0, 10)}`,
    engine: 'hn',
  }));
  if (!out.length) throw new Error('hn: no hits');
  return out;
}

// ── arXiv（官方 Atom API）───────────────────────────────────────────────────
async function arxivSearch(query, count) {
  const url = `https://export.arxiv.org/api/query?search_query=${query.split(/\s+/).filter(Boolean).map((t) => `all:${t}`).join(" AND ")}&start=0&max_results=${Math.min(count, 20)}`;
  const xml = await httpGet(url, { timeout: SEARCH_TIMEOUT });
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  const out = entries.map((m) => {
    const e = m[1];
    const title = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
    const id = (e.match(/<id>([\s\S]*?)<\/id>/) || [])[1];
    const summary = (e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1];
    const published = (e.match(/<published>([\s\S]*?)<\/published>/) || [])[1];
    return {
      title: stripTags(title || ''),
      url: stripTags(id || ''),
      snippet: stripTags(summary || '').slice(0, 300) + (published ? ` · ${String(published).slice(0, 10)}` : ''),
      engine: 'arxiv',
    };
  }).filter((r) => r.url).slice(0, count);
  if (!out.length) throw new Error('arxiv: no entries');
  return out;
}

// ── GitHub（官方 API，未认证限速 10 req/min）────────────────────────────────
async function githubSearch(query, count) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${Math.min(count, 20)}`;
  const body = await httpGet(url, {
    headers: { accept: 'application/vnd.github+json' },
    timeout: SEARCH_TIMEOUT,
  });
  const data = JSON.parse(body);
  const out = (data.items || []).map((r) => ({
    title: r.full_name,
    url: r.html_url,
    snippet: `★${r.stargazers_count} · ${(r.description || '').slice(0, 220)}${r.language ? ` · ${r.language}` : ''}`,
    engine: 'github',
  }));
  if (!out.length) throw new Error('github: no items');
  return out;
}

// ── Bing（地理重定向飘忽，仅显式指定时启用）──────────────────────────────────
async function bingSearch(query, count) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-US&setlang=en&ensearch=1&cc=US&count=25`;
  const html = await httpGet(url, {
    headers: { cookie: 'SRCHHPGUSR=SRCHLANG=en; _EDGE_S=mkt=en-us&ui=en-us' },
    timeout: SEARCH_TIMEOUT,
  });
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)];
  const out = [];
  for (const b of blocks) {
    if (out.length >= count) break;
    const block = b[0];
    const link = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    let snippet = '';
    const cap = block.match(/<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (cap) snippet = stripTags(cap[1]);
    let u = decodeEntities(link[1]);
    const ck = u.match(/[?&]u=a1([^&]+)/i);
    if (ck) {
      try { u = Buffer.from(ck[1], 'base64').toString('utf8'); } catch { /* keep raw */ }
    }
    if (!/^https?:/.test(u) || u.includes('bing.com') || u.includes('microsoft.com/bing')) continue;
    out.push({ title: stripTags(link[2]) || u, url: u, snippet, engine: 'bing' });
  }
  if (!out.length) throw new Error('bing: no results parsed');
  return out;
}

// ── 正文抽取（静态层）────────────────────────────────────────────────────────
function extractMainText(html) {
  let title = '';
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) title = stripTags(tm[1]);
  const ogm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogm) title = decodeEntities(ogm[1]);

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');

  let main = body.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)
    || body.match(/<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  let source = main ? main[2] : body;

  source = source
    .replace(/<(div|section)[^>]*(class|id)=["'][^"']*(comment|advert|ad-|related|sidebar|footer|nav|menu|share|social)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ');

  // 块级标签转行，其余标签全部剥掉（td/th/center 等也算行分隔）
  source = source
    .replace(/<(p|br|li|h[1-6]|pre|tr|div|section|article|td|th)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  let text = decodeEntities(source)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

async function fetchPage(targetUrl, maxChars) {
  const html = await httpGet(targetUrl, { timeout: FETCH_TIMEOUT });
  const { title, text } = extractMainText(html);
  if (!text || text.length < 60) {
    throw new Error(`fetch: no readable main text extracted (${html.length} bytes HTML) — 可能需要浏览器层（ego-browser / web-access CDP）`);
  }
  return {
    url: targetUrl,
    title: title || targetUrl,
    text: text.length > maxChars ? text.slice(0, maxChars) + '\n…[truncated]' : text,
    charCount: text.length,
    truncated: text.length > maxChars,
  };
}

// ── 站点经验库 ──────────────────────────────────────────────────────────────
// 查找顺序：RESEARCH_SITE_PATTERNS 环境变量（多个目录用 : 分隔）→ 本脚本同级 site-patterns/ 目录。
const SITE_PATTERN_DIRS = [
  ...(process.env.RESEARCH_SITE_PATTERNS ? process.env.RESEARCH_SITE_PATTERNS.split(':') : []),
  join(dirname(fileURLToPath(import.meta.url)), 'site-patterns'),
];
async function siteHint(domain) {
  const name = String(domain).toLowerCase().replace(/^https?:\/\//, '').split('/')[0].trim();
  if (!name.includes('.')) throw new Error(`site_hint: invalid domain "${domain}"`);
  for (const dir of SITE_PATTERN_DIRS) {
    const file = `${dir}/${name}.md`;
    if (existsSync(file)) {
      const content = await readFile(file, 'utf8');
      return { domain: name, found: true, content: content.slice(0, 8000) };
    }
  }
  return { domain: name, found: false, content: 'no site-pattern for this domain; 按通用模式处理（curl 静态层 → CDP 浏览器层）' };
}

// ── MCP server ──────────────────────────────────────────────────────────────
const server = new McpServer({ name: 'dsh-research-mcp', version: '0.2.0' });

const ENGINE_FNS = { ddg: ddgSearch, bing: bingSearch, hn: hnSearch, arxiv: arxivSearch, github: githubSearch };

server.registerTool(
  'search',
  {
    description:
      '国际多引擎检索（非中文索引优先），零 API key：' +
      'ddg=通用网搜（走本机代理，带重试）；hn=Hacker News 讨论（Algolia API，AI 前沿话题首选）；' +
      'arxiv=论文标题摘要；github=仓库按 star 排序；bing=可选（地理重定向飘忽）。' +
      '默认 "ddg,hn"；AI/技术研究建议 "ddg,hn,arxiv" 或 "ddg,hn,github"。' +
      '返回 title/url/snippet/engine。中文内网信息请用内置 web_search 补充。',
    inputSchema: {
      query: z.string().min(1).max(400).describe('检索词，建议英文或站点名定向'),
      engines: z.string().optional().describe('逗号分隔：ddg,bing,hn,arxiv,github（默认 "ddg,hn"）；单引擎失败不影响其余'),
      count: z.number().int().min(1).max(20).optional().describe('每引擎返回条数，默认 8'),
    },
  },
  async ({ query, engines = 'ddg,hn', count = 8 }) => {
    const wanted = [...new Set(engines.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const jobs = wanted.filter((e) => ENGINE_FNS[e]).map((e) => ({ e, fn: ENGINE_FNS[e] }));
    if (!jobs.length) throw new Error(`search: no valid engines in "${engines}" (ddg,bing,hn,arxiv,github)`);

    const results = [];
    const errors = [];
    for (const { e, fn } of jobs) {
      try {
        results.push(...(await fn(query, count)));
      } catch (err) {
        errors.push(`${e}: ${err?.message || String(err)}`);
      }
      await sleep(250);
    }
    const seen = new Set();
    const merged = results.filter((r) => {
      const k = r.url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('?')[0];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const text = JSON.stringify({ query, engines: jobs.map((j) => j.e), count: merged.length, errors, results: merged }, null, 2);
    return {
      content: [{ type: 'text', text }],
      structuredContent: { query, engines: jobs.map((j) => j.e), count: merged.length, errors, results: merged },
    };
  }
);

server.registerTool(
  'fetch',
  {
    description:
      '抓取网页全文并抽取正文（静态层，走本机代理）。适合博客、官方公告、文档、新闻页。' +
      '若静态层失败或页面是 JS 渲染/反爬，改用 ego-browser 或 web-access CDP 层。',
    inputSchema: {
      url: z.string().url().describe('目标页面完整 URL'),
      maxChars: z.number().int().min(500).max(60000).optional().describe('正文最大字符数，默认 12000'),
    },
  },
  async ({ url, maxChars = 12000 }) => {
    const r = await fetchPage(url, maxChars);
    const text = JSON.stringify(r, null, 2);
    return { content: [{ type: 'text', text }], structuredContent: r };
  }
);

server.registerTool(
  'site_hint',
  {
    description:
      '读取 web-access 共享库中某站点的爬取经验（有效模式、反爬陷阱、登录态要求），' +
      '在抓取陌生站点前先查，少走弯路。',
    inputSchema: {
      domain: z.string().min(3).describe('域名，如 "x.com" 或 "https://news.ycombinator.com/item?id=1"'),
    },
  },
  async ({ domain }) => {
    const r = await siteHint(domain);
    return {
      content: [{ type: 'text', text: r.found ? r.content : `[${r.domain}] ${r.content}` }],
      structuredContent: r,
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[dsh-research-mcp] v0.2.0 ready — tools: search(ddg,bing,hn,arxiv,github) / fetch / site_hint');
