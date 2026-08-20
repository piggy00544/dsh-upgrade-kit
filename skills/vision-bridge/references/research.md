# vision-bridge 设计决策

date: 2026-08-19
status: 已实施（v0.1.0）

## 问题

部分文本模型无图像输入（例如 deepseek-v4-pro，`read_image` 报错 "model ... does not declare image input"）。
需要一条"看图"通道：截图、UI 验证、OCR、报表图。

## 候选模型对比

| 候选 | 通道 | 成本 | 取舍 |
|---|---|---|---|
| Qwen3-VL-Flash（阿里百炼） | OpenAI 兼容 API | 限免 50 万 token（约 19 万张 1MB 图） | OCR/UI grounding 免费档最强 → 选定为默认 |
| DeepSeek-OCR（硅基流动托管） | OpenAI 兼容 API | 免费档 | 只做 OCR，不能问答 → 备选 |
| GLM-4.6V（智谱） | OpenAI 兼容 v4 | 按量 | 通用视觉备选 |
| MiniMax-VL-01 | OpenAI 兼容 | 按量 | 备选 |
| DeepSeek 官方 API | — | — | 无视觉端点（api-docs.deepseek.com 核对，仅文本模型）→ 排除 |
| 本地 Ollama（qwen3-vl / qwen2.5-vl） | 本机推理 | 零成本零外发 | 质量低于云端；作为隐私模式后手，未内置 |

## 候选工具对比

| 候选 | 形态 | 结论 |
|---|---|---|
| dsh-free-vision（FuzzySoul） | DSH 插件，内嵌 luma-mcp | 依赖 pnpm、第三方运行时黑盒 → 不选 |
| luma-mcp（JochenYang） | MCP server（TS），MIT | 内核优秀；其 vision-skill 单文件脚本可零依赖 vendored → 选为上游 |
| 自写脚本 | 零依赖 CLI | 最终形态：vendored luma-mcp vision 脚本 + 改造（provider 预置、task modes、sips 降采样、重试、--list/--dry-run/--json） |

## 上游与来源

- JochenYang/luma-mcp，MIT License (Copyright (c) 2025 Jochen)：https://github.com/JochenYang/luma-mcp
- dsh-free-vision：https://github.com/FuzzySoul/dsh-free-vision
- DeepSeek 官方 API 文档（无视觉端点）：https://api-docs.deepseek.com

## 文件布局与安全

- 技能目录：`{SKILL.md, scripts/vision.mjs, references/research.md, config.example.json}`
- key 存 `~/.config/vision-bridge/config.json`（0600），绝不放进技能目录，避免随任何同步通道泄露。
- 图片内容外发到第三方云 API 是既定设计代价，使用前请自行评估数据敏感度；敏感图片务必先征得确认。

## 演化路线（未做）

1. 本地隐私模式：Ollama + qwen3-vl 小模型，脚本加 ollama provider（OpenAI 兼容 11434/v1），零外发。
2. MCP 形态：把脚本包一层 stdio MCP server，经 DSH 内建 dsh-mcp-client 接入 cordis.patch.yml，变成一等工具。
3. DSH 插件形态：注册原生工具 + 设置界面（需要 dsh plugin 流程）。
