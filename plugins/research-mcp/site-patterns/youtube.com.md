---
domain: youtube.com
aliases: [YouTube, yt]
updated: 2026-07-09
---
## 平台特征
- 频道视频列表与单视频元数据都在 `window.ytInitialData`（列表）与 `window.ytInitialPlayerResponse`（单视频）这两个全局对象里，**不在序列化 HTML 里**（HTML 里 `videoRenderer`/`lengthText` 计数为 0 属正常）。
- 2026 年频道页用 **`lockupViewModel`** 组件，不再是老的 `gridVideoRenderer`/`videoRenderer`。一个 lockup = 一个视频。
- 私享/会员视频：`ytInitialPlayerResponse.playabilityStatus.status` = `LOGIN_REQUIRED`，正文显示「私享视频」。公开可播为 `OK`。

## 有效模式
- **频道全量视频清单**（标题/时长/播放量/发布时间）：打开 `https://www.youtube.com/@<handle>/videos`，递归遍历 `ytInitialData` 找所有 `lockupViewModel`：
  - id = `lockupViewModel.contentId`
  - 标题 = `metadata.lockupMetadataViewModel.title.content`
  - 时长 = lockup 内 `thumbnailBadgeViewModel.text`（如 "19:28"）
  - 播放量+日期 = `lockupMetadataViewModel` 下递归找 `contentMetadataViewModel.metadataRows[].metadataParts[].text.content`
- **单视频元数据**（最稳）：打开 `watch?v=<id>`，读 `ytInitialPlayerResponse.videoDetails`（title / lengthSeconds / viewCount / shortDescription / author）+ `playabilityStatus.status`。这个比抓 DOM 可靠得多。

## 有效模式（2026-07-08 登录态日常 Chrome 验证）
- **Transcript 可拿**（登录态下）：先 `#expand` 展开简介，再点文本含 "transcript" 的按钮。展开后的 panel 是 `ytd-engagement-panel-section-list-renderer` 且 `visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"`（其 `target-id` 可能为 null，不要按 target-id 找）。直接读该 panel 的 `innerText`，含章节名+时间戳+逐句文本；`ytd-transcript-segment-renderer` 计数可能仍为 0（modern transcript view 不用这个组件）。
- **后台 tab 评论区不懒加载**：`/scroll` 到底也不触发 `youtubei/v1/next`（IntersectionObserver 不跑）。可靠替代：页面上下文内 fetch innertube——从 `ytInitialData` 递归找 `itemSectionRenderer.sectionIdentifier==="comment-item-section"` 下的 `continuationCommand.token`，POST `/youtubei/v1/next?key=ytcfg.data_.INNERTUBE_API_KEY`，body `{context: ytcfg.data_.INNERTUBE_CONTEXT, continuation: token}`，credentials include。响应里递归找 `commentEntityPayload`（author.displayName / toolbar.likeCountNotliked / toolbar.replyCount / properties.publishedTime / properties.content.content），`commentsHeaderRenderer.countText` 是总评论数。一次返回默认排序（Top）前 20 条。
- Modern transcript view 的段落组件是 **`transcript-segment-view-model`**（panel `target-id="PAmodern_transcript_view"`）；每段 innerText 含时间戳+无障碍时长文本（如 "7 seconds"）+正文，导出时过滤 `^\d+ (seconds?|minutes?)` 行。
- **标题 A/B 测试**：`ytInitialPlayerResponse.videoDetails.title` 与 DOM `h1.ytd-watch-metadata` 可能不同（两个标题变体），需要"用户实际看到的标题"时以 DOM h1 为准，两处都读。
- 精确发布时间：`ytInitialPlayerResponse.microformat.playerMicroformatRenderer.publishDate`（带时区的 ISO 时间戳）。
- 封面直链无需登录：`https://i.ytimg.com/vi/<id>/maxresdefault.jpg`。
- **字幕最稳路径 = ANDROID client innertube（2026-07-08 验证，登录/未登录均可）**：后台 tab 点 "Show transcript" 可能只出 spinner、panel 一直空（后台节流）；`/youtubei/v1/get_transcript` 返回 400 failedPrecondition。可靠替代：页面上下文内 `fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {method:"POST", body: JSON.stringify({context:{client:{clientName:"ANDROID",clientVersion:"20.10.38",androidSdkVersion:30,hl:"en"}}, videoId})})`，拿 `captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl` 直接 fetch（无需 PoT token、无需 SAPISIDHASH），返回 timedtext format=3 XML：`<p t="毫秒" d="时长"><s>词</s>...</p>`，用正则 `/<p t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g` 提取即可得全量带时间戳逐句字幕。
- 评论 `/youtubei/v1/next` 走登录态 cookie 时带上 SAPISIDHASH Authorization 头更稳（`SHA-1(ts + " " + SAPISID + " " + origin)`，SAPISID 从 document.cookie 拿）。
- 页面上下文 eval 里 `DOMParser.parseFromString` 会被 YouTube 的 TrustedHTML CSP 拦，解析 XML 用正则，别用 DOMParser。
- **卡住的 continuation 万能解（2026-07-08 验证）**：后台 tab 里 transcript panel 只出 spinner、评论区滚到底也不加载时，用 YouTube 自己的命令解析器强制触发：`document.querySelector("ytd-app").resolveCommand(contEl.data.continuationEndpoint, contEl)`，其中 `contEl` 是目标区域内的 `ytd-continuation-item-renderer`。对 transcript（老式 `engagement-panel-searchable-transcript`，触发后渲染出 `ytd-transcript-segment-renderer`）和评论区都有效。注意：同一个 continuation 重复 dispatch 会追加重复内容，翻页时每次重新取**最后一个** continuation item。
- **评论按 Top 排序拉取**：`ytInitialData` 里找 `sortFilterSubMenuRenderer.subMenuItems`（[Top comments, Newest first]），取 Top 的 token 走 `/youtubei/v1/next`（页面上下文、不带 key 参数也行），响应 `frameworkUpdates.entityBatchUpdate.mutations[].payload.commentEntityPayload` 拿评论实体，顶层/回复区分靠 `commentThreadRenderer.commentViewModel` 的 id 顺序；每页 ~20 条，翻页 token 在 `continuationItemRenderer`（排除带 `button` 的，那是"加载回复"）。

- **Playlist 全量抓取最稳路径 = 页面上下文 innertube browse（2026-07-09 验证）**：`POST /youtubei/v1/browse` body `{context: ytcfg.data_.INNERTUBE_CONTEXT, browseId: "VL"+playlistId}`，每页 ~100 个 `playlistVideoRenderer`；翻页用响应里 `continuationCommand.token` 再 POST `{context, continuation}`。**注意响应里可能有多个 token（含 reload/排序 token），选错会原地打转**——可靠做法：逐个 token 试、以"本页新增唯一 videoId 数 > 0"判断推进，全部 token 无新增才停。podcast 型 playlist（"N episodes"）同样走 VL browseId。页面显示的视频总数含私享/已删除条目，实抓可见数偏少（如标称 284 实得 237）属正常。频道 playlists 页 `list=` 短 ID（如 `PLDyBmFH9HlVc` 13 位）是真实 ID，直接可用。
- 后台 tab `/scroll` 不触发频道 playlists 页懒加载，同样用 `ytd-app.resolveCommand(contEl.data.continuationEndpoint, contEl)` 强制翻页有效（2026-07-09 复验）。
- 代理 `/eval` 对 async IIFE 会 awaitPromise，但有 ~30s 超时；长任务把结果写 `window.__x` 后轮询，超时报错不代表脚本中断。

## 已知陷阱（2026-06-14 验证）
- **dedicated profile 未登录 + CDP 驱动时，视频帧采样基本不可用**：`video.currentTime=` seek 后 `readyState` 停在 0，截图只拿到首帧/title card；`play()` promise 静默 reject。想按时间戳截画面 → 不可靠，别在这上面耗。
- **字幕/transcript 抓取被反爬挡**：`captionTracks[0].baseUrl`（含签名）能从 playerResponse 拿到，但 `fetch()` 该 URL（任何 fmt：json3/srv1/vtt/默认）都返回 **len=0**——缺 proof-of-origin token。点 DOM 里「转写文稿/Show transcript」按钮，engagement panel 仍 `VISIBILITY_HIDDEN`、`ytd-transcript-segment-renderer` 数量为 0。结论：未登录 CDP 环境拿不到带时间戳的逐句字幕。需要时改用登录态日常 Chrome，或外部 transcript 服务。
- seek 触发的播放可能插入 pre-roll 广告（`#movie_player.classList` 含 `ad-showing`），截图会拍到广告而非内容。判断 `ad-showing` 再截。

## 适合的事 / 不适合的事
- 适合：批量拿频道视频清单、时长、播放量、描述、可播状态——全部走 ytInitialData/playerResponse，快且稳。
- 不适合：未登录 CDP 下逐帧看视频内容、抓时间戳字幕。
