---
domain: config.figma.com
aliases: [Figma Config, Config 大会]
updated: 2026-07-09
---
## 平台特征
- Next.js（React Server Components），**无 `__NEXT_DATA__`**，agenda 数据直接渲染在 DOM 里（2026-07-09）。
- 无反爬、无需登录，公开可读。
- Config 2026 站点结构：`/san-francisco/`（主会）、`/san-francisco/agenda/`、`/san-francisco/speakers/`、`/india/`（Config India）。

## 有效模式（2026-07-09 验证）
- **agenda 三天内容全部同时在 DOM**，tab 切换只是 CSS 显隐。日期 tab 按钮 id 为 `day-0` / `day-1` / `day-2`，对应内容容器用 `[aria-labelledby="day-N"]` 选取，无需点击 tab 即可全量提取。
- 每个 session 卡片含指向 `/san-francisco/session/{uuid}/`（演讲）或 `/event/{uuid}/`（活动）的链接；按该链接去重，向上走 DOM 找含 "WHEN:" 的祖先即卡片容器。
- 卡片内字段：时间行以 `PDT` 结尾；场地是时间后一行（跳过 `DOORS...` 行）；`Theme:` / `Topic:` 后跟换行值；讲者是 `a[href*="speaker="]`，姓名在 `.my-15yb2s8`、职位公司在 `.my-z94xfs`（class 为 CSS-in-JS hash，可能随部署变化，fallback 用 innerText）。
- 回放链接：卡片内 `a[href*="youtube.com"]`（WATCH RECORDING）。注意官网 "Recording coming soon" 不可信——playlist 上往往已发布，以 YouTube playlist 实际为准。
- Config 2026 官方回放 playlist：`PLXDU_eVOJTx6erPKfFHtCNbyCmcCn4zrp`（YouTube @Figma）。keynote 大块会被拆成多条独立视频发布；部分 session 回放标题与 agenda 标题不同（如 "Get animated with Figma Motion" → "Figma deep dive: Motion"），匹配优先用 agenda WATCH RECORDING 链接里的 video id。
- Learning labs（动手工作坊）无回放。

## 已知陷阱
- 页面顶部 FEATURED SESSIONS 轮播与 agenda 列表内容重复，全页扫 section 会重复抓取——限定在 `[aria-labelledby="day-N"]` 容器内即可避开。
