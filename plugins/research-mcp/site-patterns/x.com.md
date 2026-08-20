---
domain: x.com
aliases: [Twitter, 推特, X]
updated: 2026-07-06
---
## 平台特征
- （2026-07 验证）**未登录状态下个人主页可深度浏览**：`x.com/{handle}` 直接渲染 bio、加入时间、关注/粉丝数、posts 总数，且时间线可连续滚动 10+ 屏不触发登录墙（约 30+ 条推文）。展示的是按互动排序的"热门"推文，非严格时间序。
- 未登录时推文详情页、搜索、Respuestas/replies tab 通常受限；主页 feed 是最大的免登录信息面。
- 界面语言跟随浏览器 locale（本机 Chrome 为西语，日期如 "5 mar 2025"、"Te uniste el March 2018"）。

## 有效模式
- claude-in-chrome 扩展通道可用（用户日常 CDP 9222 授权弹窗无人点击时的替代路径）。
- 提取推文：`[...document.querySelectorAll('article')].map(a=>a.innerText)` 每屏约 4-5 条 article 在 DOM 中，滚动后旧的被虚拟化移除，**每滚 2-3 屏就要提取一次**，否则丢内容。
- 互动数（回复/转发/赞/浏览）直接在 article innerText 里不稳定，但截图中清晰可读；views 在 `a[href*=analytics]`。
- 粉丝数：`a[href*="followers"]` 的 innerText 可靠。
- bio/加入时间：`[data-testid=UserDescription]` 等 testid 选择器在未登录版不总是存在，截图兜底更稳。

- （2026-07-08 验证）**未登录推文详情页可用**：`x.com/{handle}/status/{id}` 渲染主推文全文 + 浏览量（"N万 Views"）+ 回复总数（"Read N replies"），但不显示点赞/转发数，回复内容本身被登录墙挡住。quotes 页、搜索页未登录全挡。
- （2026-07-08）**点赞/转发数在作者主页 article 内**：格式 `|replies|reposts|likes|views`，但被 number-flow CSS 文本污染，用 `t.replace(/:where\(number-flow[\s\S]*?\* 2\) 0\}/g,"|")` 清洗后可读。
- （2026-07-08）**找高传播解读的免登录路径**：WebSearch `site:x.com "关键词"` 找到候选 URL → 逐条开详情页拿全文+浏览量。Google 索引的 X 推文标题即含正文前 200 字符。
- （2026-07-08）未登录详情页 `[data-testid=tweetText]` 在部分页面存在、部分不存在，article.innerText + 清洗兜底更稳。

## 已知陷阱
- （2026-07）`div[data-testid="primaryColumn"]` 在未登录版页面不存在，别依赖它。
- 底部持续悬浮登录条 + cookie 弹窗遮挡内容，先点"Rechazar cookies no necesarias"。
- 虚拟滚动：一次性滚太多再提取会永久错过中间的推文。
