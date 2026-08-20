---
domain: bilibili.com
aliases: [B站, 哔哩哔哩, bilibili]
updated: 2026-07-08
---
## 平台特征
- 搜索页 `https://search.bilibili.com/all?keyword=KW&order=click|pubdate` 无需登录即可 CDP 渲染，结果在 `.bili-video-card` 卡片中（2026-07-08 验证）
- 搜索结果混有广告卡片，URL 指向 `cm.bilibili.com/cm/api/fees/...`，按 `href` 含 `/video/BV` 过滤即可
- 公开 API 无需登录、无需 wbi 签名即可用（2026-07-08 验证，仅需普通 UA header）：
  - 视频详情：`https://api.bilibili.com/x/web-interface/view?bvid=BVxxx` → title/owner/pubdate/stat(view,like,coin,favorite,danmaku,reply,share)/desc/cid
  - 热评：`https://api.bilibili.com/x/v2/reply?type=1&oid=AID&sort=2&ps=20`（sort=2 按热度；带 Referer 更稳）
  - 弹幕：`https://api.bilibili.com/x/v1/dm/list.so?oid=CID`（XML，curl 加 --compressed）

## 有效模式
- 调研类任务最优路径：CDP 搜索页拿 BV 号清单 → 直接 curl 公开 API 批量拉详情/评论/弹幕，不必逐个打开视频页
- 搜索卡片字段 selector：`.bili-video-card__info--tit`（title 属性含完整标题）、`--author`、`--date`、`.bili-video-card__stats--item`（播放、弹幕）

## 已知陷阱
- 搜索卡片 stats 只有播放+弹幕两项，点赞/投币/收藏需走 view API
- 卡片日期是相对时间（"昨天"、"N小时前"），精确发布时间用 view API 的 pubdate
- 短时间密集 curl API 加 sleep 0.5s 间隔，未触发风控（20 次连续请求验证通过）
- **AI 字幕登录墙**（2026-07-08）：`api.bilibili.com/x/player/wbi/v2?bvid=..&cid=..` 未登录返回 code 0 但 `subtitle.subtitles` 为空数组——不代表无字幕，是登录才可见。未登录 CDP 拿不到 AI 字幕逐句文本；登录态检测用页面内 fetch `x/web-interface/nav` 看 `data.isLogin`
- 名人科普视频常见"官方号历史清空、仅存搬运"（如李永乐官方 B站无 2018-2023 AI 系列）：view API 的 `pages[]` 分P标题常保留原始视频标题，可用于考据原作，再回溯原发平台（西瓜/微博）
- 想要视频逐句文字稿时，比死磕 B站字幕更快：作者本人的 网易号 / 微博头条文章（ttarticle）/ 观察者网专栏 常有官方图文版

## 有效模式（补充 2026-07-08）
- UP主空间内搜索：`space.bilibili.com/<mid>/search/video?keyword=...`（渲染慢，等 3s 后从 `a[href*="/video/BV"]` 提取）
- 中文关键词经 proxy `/navigate` 传双重 percent-encoding 可能乱码；稳妥做法：先到站内任意页，再 eval `location.href = base + encodeURIComponent(kw)` 导航
