---
name: dsh-upgrade-kit
description: DSH 装备升级套件：token 费用面板（dsh-cost）、会话文件预览（dsh-plugin-file-preview）、外网搜集（dsh-research-mcp，工具名 mcp__research__*）、视觉桥接（vision-bridge，给无视觉模型看图）。已安装时，用户问"花了多少钱/预览这个文件/搜一下外网/看这张图"直接按对应组件办事；未安装时给出 install.sh 一键安装命令。
metadata:
  version: "0.1.0"
  date: "2026-08-20"
---

# dsh-upgrade-kit — DSH 装备升级套件

四件装备给 DeepSeek Harness：看钱、看文件、搜外网、看图片。

## 组件速查

| 组件 | 触发信号 | 怎么办 |
|---|---|---|
| dsh-cost 费用面板 | "花了多少钱 / token 用量 / 余额" | 台账在 `$DSH_HOME/sessions/*/*/session.jsonl.zstd`；host API `/api/dsh-cost/{summary,balance,balance/refresh,prices}`；价格表在 `plugins/dsh-cost/lib/index.js` 的 `SCHEDULE`，DeepSeek 调价时改这里并重启 web |
| dsh-plugin-file-preview | 用户想看会话产物 / 附件 | 纯 UI 插件：产物卡片在 assistant 回合尾部，附件面板在会话头部「附件」按钮；无需 agent 动作，说明按钮位置即可 |
| dsh-research-mcp | "搜外网 / 查英文资料 / 抓这个网页" | 工具 `mcp__research__search`（engines: ddg,hn,arxiv,github,bing）、`mcp__research__fetch`（全文抓取）、`mcp__research__site_hint`（站点经验）；走 `HTTP_PROXY/HTTPS_PROXY` 环境变量，零 key |
| vision-bridge | 贴图 / "看这张图 / OCR / 识别" | 跑 `node ~/.agents/skills/vision-bridge/scripts/vision.mjs "<图片路径>" "<问题>"`；模式自动路由（ocr/ui/debug/describe）；ui 模式坐标 0-1000 归一化，配合浏览器自动化换算点击位置；key 在 `~/.config/vision-bridge/config.json` |

## 安装（未装时）

```bash
curl -fsSL https://raw.githubusercontent.com/<OWNER>/dsh-upgrade-kit/main/install.sh | bash
```

装完重启 web。vision-bridge 需要用户配 key（阿里百炼 DashScope 等任一 provider），配好前该组件不可用，其余三件不受影响。

## 维护提示

- 所有组件零 API key（vision-bridge 除外，key 由用户自备且存在 `~/.config/vision-bridge/config.json`，绝不进仓库）。
- DeepSeek 调价 → 更新 `plugins/dsh-cost/lib/index.js` 的 `SCHEDULE` 并重启 web。
- 上游 luma-mcp 更新 → 重新 vendor 其 vision 脚本并保留本仓库改造（provider 预置、task modes、重试、坐标归一化）。
