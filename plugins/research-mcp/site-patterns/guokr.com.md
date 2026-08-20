---
domain: guokr.com
aliases: [果壳, 果壳网, Guokr]
updated: 2026-07-08
---

## 平台特征
- 果壳网文章无登录墙、无反爬（2026-07-08 验证），公众号"果壳"（微信号 Guokr42）的文章会同步到 guokr.com，站内版含公众号元信息（作者、编辑、"一个AI"栏目等）
- 文章 URL 模式：`https://www.guokr.com/article/<数字ID>/`，移动版 `https://m.guokr.com/article/<ID>` 内容相同

## 有效模式
- **Jina 直接可用**：`curl r.jina.ai/https://www.guokr.com/article/<ID>/` 一次拿到干净全文 Markdown（含字数、图注、作者编辑信息），无需 CDP（2026-07-08 验证两篇均成功）
- 搜索发现：Google `site:guokr.com <关键词>` 命中率高；比站内搜索好用
- 页面自带"N 字 / 需用时 MM:SS"元信息，可直接用于长度判断

## 已知陷阱
- Jina 输出头尾有导航和 footer 噪音（首页/科学人/物种日历…、备案信息），正文从 `# 标题` 之后开始
