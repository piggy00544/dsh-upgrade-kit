---
domain: mp.weixin.qq.com
aliases: [微信公众号, WeChat Official Account, 公众号]
updated: 2026-05-04
---

## 平台特征
- 微信公众号文章对非微信客户端访问有反爬机制
- WebFetch 直接抓取会命中验证页面（"环境异常，完成验证后即可继续访问"），无法获取文章内容
- 必须通过 CDP 浏览器模式访问
- 公众号管理后台 (mp.weixin.qq.com 登录后台) 是访问作者自己历史文章列表的**唯一稳路径**——产品本身没有公开的"作者主页 URL"
- 后台请求需要 token (URL 参数)，登录后从 home URL 提取：`new URL(location.href).searchParams.get("token")`
- 后台 API 有 referer 检查，跨页 fetch 会返回 `{ret: 200009, err_msg: "not found"}`，必须 navigate 到对应页面再 eval

## 有效模式

### 单篇文章正文（任何用户都可以）
- 2026-04-06 验证：CDP `/new` 直接打开文章 URL (mp.weixin.qq.com/s/<id>) 可正常加载全文
- 标题：`document.title`
- 正文：`document.getElementById("js_content").innerText`
- 类型标识（原创/转载）：`document.querySelector(".icon_appmsg_tag.appmsg_title_tag, .original_tag_default")?.innerText?.trim()` === "原创" / "转载" / null
- 作者：`document.querySelector("#js_name, .rich_media_meta_link, #profileBt a")?.innerText?.trim()`
- 发布时间：`document.querySelector("#publish_time, em#publish_time")?.innerText?.trim()`（精确到分钟）
- 图片：`Array.from(document.querySelectorAll("#js_content img")).map(i=>i.dataset.src||i.src)`
- 慢速抓取节奏：每篇间隔 8-10 秒避免触发风控；单点 FAIL 通常单点风控，retry 即可；连续多篇 FAIL 才需要停下来人工 verify

### 自己后台抓取「发表记录」全文章列表（2026-05-04 新增，仅作者本人）
- 入口 URL: `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=N&count=20&token=<TOKEN>&lang=zh_CN`
- **翻页步进=10**（不是 count 值！），count 参数最大被服务端限到 ~20，`begin=10` 对应第 2 页、`begin=20` 第 3 页…
- 每页含 ~16-24 个 `a[href*="mp.weixin.qq.com/s/"]` link（不固定，因为一次群发可含多图文）
- 全部 URL 提取策略：navigate begin=0,10,20,...,310，每页 grep `a[href*="/s/"]`，合并去重
- 总条数：inline script 内嵌 `publish_page = {"total_count":N,...}`（含 publish_count + masssend_count 两类）
- 一次群发可含多篇文章 → 实际 unique URL 数会比 total_count 多 5-15%（账号年代越久越多）
- 完整脚本范例：本项目 `scripts/fetch-wechat-list.mjs`（生产实测 7 年 305 群发→330 unique URLs）

## 已知陷阱
- **嵌套 section 结构导致 innerText 重复**（2026-04-06）：遍历所有 section/p 元素时父级 innerText 包含所有子级文本，必须用 `getElementById("js_content").innerText` 直接拿纯文本，不要 querySelectorAll 累加
- **登录墙误判**（2026-05-04）：用 `.weui-msg__title` 或 `.global_error_msg` 检测登录墙会误判普通文章——这两个类是通用 UI 元素，不只用于错误页。正确检测：`document.title.includes("环境异常") || document.title.includes("验证") || document.title === "" || (js_content === null && body.innerText.includes("环境异常"))`
- **list_card API 跨页 fetch 失败**（2026-05-04）：`/cgi-bin/appmsgpublish?action=list_card&...` 直接 fetch 返回 200009 not found，因为有 referer 检查。必须 navigate 到对应 list 页面后再 eval
- **count 参数被服务端 cap**（2026-05-04）：试 count=300 实际只返回 ~19 条，无法一把过；只能按 step=10 翻页
- **inline publish_page JSON 嵌套转义复杂**（2026-05-04）：HTML 里 publish_info 字段双重 &quot; 转义，直接 JSON.parse 会失败；不如直接从 DOM 提取 a[href] 简单
- URL 中的 query 参数（clicktime, enterid, scene 等）不影响文章加载，可以保留也可以省略

## 网络/控制台信号
- 反爬触发时：`document.title` 包含"环境异常"/"验证"，`#js_content` 为 null
- 后台 API referer 检查失败：response body `{"base_resp":{"ret":200009,"err_msg":"not found"}}`
- 单篇文章正常加载后 console 通常 200+ 条 badjs.weixinbridge.com POST，可以忽略

## 可复用操作技能
- **抓自己公众号全部历史文章**（2026-05-04 实测 330 篇 0 失败）：参考 `scripts/fetch-wechat-list.mjs` (取 URL 列表) + `scripts/fetch-wechat-bodies.mjs` (慢速抓正文)，两个脚本均在 writing system 项目内
- 节奏控制：list 页翻页间隔 4 秒、单篇正文间隔 8-10 秒、`fetch-failed.json` 收集失败、最多重试 2 次
- **重要**：抓自己后台不计费、不占任何配额、不会封号，只可能触发人机验证（让用户过一下即可）
