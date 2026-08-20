---
domain: web.okjike.com
aliases: [即刻, Jike, okjike]
updated: 2026-04-12
---

## 平台特征

- 即刻 Web 版，社交平台，用户发布短文动态
- 前端框架：React + TanStack Router (`__TSR_ROUTER__`)，UI 库 Mantine
- 需要登录才能查看用户主页，未登录会跳转到登录页
- API base URL: `https://api.ruguoapp.com/1.0/`，请求方式为 XHR
- CDN 域名: `cdnv2.ruguoapp.com`
- 用户主页 URL 格式: `https://web.okjike.com/u/{username-uuid}`

## 有效模式

### 抓取用户动态列表（2026-04-12 验证）

**核心挑战：虚拟列表渲染**

即刻用 Mantine ScrollArea 组件实现虚拟列表，DOM 中同时只存在少量帖子（通常 2-4 条）。必须通过逐步滚动 + 实时收集来获取全部内容。

**步骤：**

1. **滚动目标**：滚动 `.mantine-ScrollArea-viewport`，不是 window
   ```js
   const vp = document.querySelector(".mantine-ScrollArea-viewport");
   vp.scrollTop += 600; // 小步滚动
   ```

2. **注入 collector**：在 `window.__collectedPosts` 上累积，每次滚动后调用
   ```js
   window.__collectedPosts = window.__collectedPosts || {};
   const wrappers = document.querySelectorAll("[class*=contentWrapper]");
   for (const w of wrappers) {
     const text = w.innerText?.trim();
     if (!text || text.length < 20) continue;
     const key = text.substring(0, 50); // 用文本前缀做去重 key
     if (window.__collectedPosts[key]) continue;
     // ... 收集 time + text
     window.__collectedPosts[key] = {time, text};
   }
   ```

3. **时间提取**：从帖子容器向上遍历 5-6 层父元素，在叶节点中匹配时间模式
   ```js
   // 时间格式：X分钟前、X小时前、X天前、X周前、X月前、或 X月X日
   el.innerText.match(/^\d+\s*(天前|小时前|分钟前|周前|月前)$|^\d{1,2}月\d{1,2}日$/)
   ```

4. **滚动节奏**：每次滚动 600px，间隔 1-1.5 秒，等待虚拟列表渲染新内容

5. **终止判断**：`vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 10` 表示到底。注意 scrollHeight 会随加载动态增长。

**帖子选择器**（hash 后缀可能随版本变化）：
- 帖子内容容器：`[class*=contentWrapper]`（如 `_contentWrapper_ycvh8_83`）
- 帖子文本：`[class*=contentText]`（如 `_contentText_2jczp_37`）
- 用户信息区：`[class*=content_gw2sk]`

### 已知 API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/1.0/users/profile?username={uuid}` | GET | 获取用户资料 |
| `/1.0/userRelation/getFollowingList` | GET | 关注列表 |
| `/1.0/userRelation/getFollowerList` | GET | 粉丝列表 |
| `/1.0/notifications/unread` | GET | 未读通知 |
| `/1.0/manifests/getBase` | GET | 基础配置 |
| `/1.0/configs/appGet` | GET | 应用配置 |

**注意**：用户动态列表的 API 端点在本次抓取中未被直接观察到。帖子数据可能通过 TanStack Router 的 loader 在路由匹配时一次性加载（SSR 或 initial load），后续滚动仅做虚拟列表的 DOM 渲染，不触发新的 API 请求。如果需要程序化获取帖子列表，可能需要进一步逆向 JS bundle 找到具体的 API 调用。

### 替代工具

- **Jocker Extension**（Chrome 扩展）：支持按主题查看/导出即刻动态为 CSV，适合用户自己导出自己的数据
- **Jike Metro**（Python SDK，较旧）：非官方 SDK，可能已过时

## 已知陷阱

1. **未登录重定向**（2026-04-12）：访问用户主页 `/u/{uuid}` 在未登录时会重定向到登录页，需要用户 Chrome 中已有即刻登录态。**搜索页 `/search?keyword=` 同样要求登录**（2026-07-08 验证：跳转 `/login?redirectURL=...`，扫码登录，无法程序化绕过；且 m.okjike.com 分享页在 Google/Bing 索引极差，站外搜索兜底基本无效）

2. **window.scrollTo 无效**（2026-04-12）：即刻的内容区域在 Mantine ScrollArea 内部，不是 document body。`window.scrollTo` 或 `curl scroll y=N` 会滚动外层，但不会触发虚拟列表渲染。必须操作 `.mantine-ScrollArea-viewport` 的 `scrollTop`

3. **CSS class hash 不稳定**（2026-04-12）：class 名如 `_contentWrapper_ycvh8_83` 中的 hash 部分可能随构建版本变化，选择器应使用 `[class*=contentWrapper]` 模糊匹配

4. **时间信息可能缺失**（2026-04-12）：部分帖子的相对时间标签未被正确提取（93 条中有 57 条缺失时间），可能因为时间元素在虚拟列表滚动过程中已被卸载。更可靠的做法可能是从 React fiber/TanStack Query cache 中读取结构化数据

5. **帖子数量与滚动深度**（2026-04-12）：约 93 条帖子需要滚动约 60 次（600px/次），总计约 36000px 深度，耗时约 90 秒
