---
domain: weibo.com
aliases: [微博, Weibo, s.weibo.com, m.weibo.cn]
updated: 2026-07-08
---

## 平台特征

- `s.weibo.com/weibo?q=` 桌面搜索：未登录时经 Sina Visitor System 跳转到 `passport.weibo.com/sso/signin` 登录页，无法访问（2026-07-08）
- `m.weibo.cn` 移动 API：**无需登录**即可搜索和读评论，返回纯 JSON（2026-07-08 验证）。首次访问会过一次 visitor.passport.weibo.cn 自动跳转，之后同 tab 内直接可用

## 有效模式（2026-07-08 验证）

搜索（containerid 需二次 URL 编码，因其内含 `&`）：
- 综合：`https://m.weibo.cn/api/container/getIndex?containerid=100103type%3D1%26q%3D{关键词}&page_type=searchall`
- 热门：`type%3D61`；话题：`type%3D38`（desc2 含"N讨论 N阅读"）
- 返回 `data.cardlistInfo.total` 为命中总数；帖子在 `data.cards[].mblog`（可能嵌套 `card_group`），含 `reposts_count / comments_count / attitudes_count / user.followers_count / isLongText`

长文全文：`https://m.weibo.cn/statuses/extend?id={mid}` → `data.longTextContent`（HTML）

热门评论：`https://m.weibo.cn/comments/hotflow?id={mid}&mid={mid}&max_id_type=0` → `data.data[]`（user.screen_name / like_count / text）

## 已知陷阱

- 直接 curl 这些 API（无浏览器 cookie）可能被拒；在 CDP tab 内 navigate 到 API URL 再读 body 最稳（2026-07-08）
- containerid 参数若只做一次编码，`&q=` 会被当作外层参数导致搜索失效
