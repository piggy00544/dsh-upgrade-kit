---
domain: docs.google.com
aliases: [Google Sheets, Google Docs, Google Slides, 谷歌表格]
updated: 2026-07-09
---
## 平台特征
- 需要 Google 登录态；未登录跳 accounts.google.com 登录页（title 含"登录"）。专用 profile 已于 2026-07-04 登录 shan 的账号。
- Sheets 网格是 canvas 渲染，DOM 里读不到单元格内容。
- 页面 CSP 会拦截页内 `fetch()` 到 export 端点（TypeError: Failed to fetch），别走这条路。

## 有效模式（2026-07-04 验证）
- 读 tab 列表：`/eval` → `document.querySelectorAll('.docs-sheet-tab-name')`，同时可从 URL/DOM 拿各 tab 的 gid。
- **取数据 = 导航到 export URL 触发浏览器下载**：
  `https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}`
  用 `/new` 打开后文件落在 `~/Downloads/{表名} - {tab名}.csv`，本地直接读。
  - 全表 xlsx：`export?format=xlsx`（不带 gid）。
- 页面 title 即表格名，如 "Mi Clip Reporting (sincronizada) - Google Sheets"。
- **Slides 同理（2026-07-09 验证）**：`https://docs.google.com/presentation/d/{ID}/export/txt` 用 `/new` 导航即触发下载，落 `~/Downloads/{演示文稿名}.txt`，纯文本含全部 slide 文字（含隐藏/附页），按 slide 编号分段。需要图表/图片时改 `export/pptx` 再用 pptx skill 解析。注意：导出文件可能包含历史周版本的存档附页，读时看 slide 编号和日期分界。

## 已知陷阱
- 页内 fetch export URL 会被 CSP 拦（2026-07-04 实测），必须用导航下载。
- 下载文件名含空格和括号，shell 引用要小心。
