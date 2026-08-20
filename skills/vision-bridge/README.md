# vision-bridge — 给无视觉模型桥接看图

你的模型不认图片？vision-bridge 把图片发给云端视觉模型，把"看到了什么"用文字带回来。零依赖单文件 CLI，配合 DSH 的 skills 机制自动触发。

## 一图流

```
你的无视觉模型 ──贴图/截图──▶ vision.mjs ──图片──▶ 云视觉模型（默认阿里 Qwen3-VL-Flash）
        ▲                                            │
        └──────────── 文字描述 / OCR / UI 坐标 ◀──────┘
```

## 能干什么

| mode | 用在哪 |
|---|---|
| `ocr` | 报表 / 文档 / 发票 / 表格 / 代码截图，只要文字 |
| `ui` | 网页 / App 截图，输出元素层级 + 可点击坐标（0-1000 归一化），配合浏览器自动化点按钮 |
| `debug` | 报错 / 日志 / stack trace 截图 |
| `describe` | 快速描述图片 |
| `auto`（默认） | 按问题关键词自动路由 |

## 快速开始

1. 复制技能目录：

   ```bash
   cp -r skills/vision-bridge ~/.agents/skills/
   ```

2. 准备一个视觉 API key（任选其一）：
   - **阿里云百炼 DashScope**（默认，新用户限免 50 万 token）：https://bailian.console.aliyun.com
   - 硅基流动 DeepSeek-OCR（免费档）：https://siliconflow.cn
   - 智谱 GLM-4.6V / MiniMax-VL-01（按量）

3. 写配置（权限 600）：

   ```bash
   mkdir -p ~/.config/vision-bridge
   cp config.example.json ~/.config/vision-bridge/config.json
   chmod 600 ~/.config/vision-bridge/config.json
   # 编辑，把 key 填进对应 provider 的 apiKey 字段
   ```

4. 试一发：

   ```bash
   node ~/.agents/skills/vision-bridge/scripts/vision.mjs "你的图片.png" "这张图里有什么？"
   node ~/.agents/skills/vision-bridge/scripts/vision.mjs --list   # 查看已配置的 provider
   ```

装好之后，在 DSH 里贴图 / 说"看这张图"，带本技能的 agent 会自动走这条通道（见 SKILL.md 的触发规则）。

## 隐私提示

图片会外发到第三方云 API。敏感数据（数据报表、带人名截图）外发前请先确认；需要零外发时可在 `references/research.md` 查看 Ollama 本地方案。

## 许可

核心脚本 vendored 自 [JochenYang/luma-mcp](https://github.com/JochenYang/luma-mcp)（MIT，Copyright (c) 2025 Jochen），改造部分同样以 MIT 发布。
