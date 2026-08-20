---
domain: web.archive.org
aliases: [Wayback Machine, 网页存档]
updated: 2026-07-06
---
## 平台特征
- CDX API 是查快照的正道：`http://web.archive.org/cdx/search/cdx?url=...&output=json`，支持 `matchType=prefix`、`from/to`、`collapse=timestamp:6`、`filter=original:.*regex.*`。（2026-07 验证）
- CDX 对整域大范围查询（`matchType=domain` + filter）经常 503/504 超时；改窄前缀（如 `site.com/slug*`）或加 `limit`，失败后隔 10s 重试常能过。
- 快照 URL 加 `id_` 后缀（`/web/{ts}id_/{url}`）返回原始未改写内容；不加则注入 wombat.js 改写。

## 有效模式（SPA 存档页取正文）
- SPA（Vite/React 等）存档页 HTML 只有空 `#root`，正文在 JS chunk 里。流程（2026-07 在 multiverse.com/letter 验证）：
  1. 浏览器打开快照，`/console` 看报错——`Failed to fetch dynamically imported module: .../assets/xxx.HASH.js` 直接暴露缺失 chunk 名；
  2. 用 CDX 按 `url=site.com/assets/&matchType=prefix` 列出已存档 assets，找同名不同 hash 的 chunk（相邻时间戳的抓取往往存了另一版本）；
  3. `curl {ts}id_/` 直接下载 chunk，内容可能是 gzip 原始字节（`file` 确认后 `gzip.decompress`），正文字符串就在 JS 里。
- TikTok 个人页快照：大体积快照（>100KB）内含 `<script id="SIGI_STATE">` 完整 JSON（followerCount/heartCount/每条视频 playCount）；小体积快照（<60KB）是验证页壳，无数据，别浪费时间。

## 已知陷阱
- 同一 URL 多个快照质量差异巨大，选 length 大的；`warc/revisit` 行无独立内容。
- 存档 JS chunk 用 curl 拿到的可能是未解压 gzip，直接 grep 会漏。
