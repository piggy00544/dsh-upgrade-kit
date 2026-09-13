---
name: vision-bridge
description: 给无视觉文本模型桥接看图能力。Use whenever I need to see or understand any image — screenshots, UI 截图, OCR, 文档/报表/发票截图, charts, error screenshots, ego-browser page.screenshot() 产物, 或用户说 读图/看图/识别/OCR/这张图/截图里有什么。Runs the local scripts/vision.mjs CLI, which sends the image to a cloud vision model (default Alibaba Qwen3-VL-Flash) and returns text.
metadata:
  version: "0.1.1"
  date: "2026-09-09"
  upstream: "JochenYang/luma-mcp (MIT)"
---

# vision-bridge

本模型（deepseek-v4-pro）无视觉，read_image 必然失败。任何"看图"需求都走本脚本：脚本把图片发给云端视觉模型，拿回文本。

## 自动触发（零门槛体验）

用户在聊天里**贴图 / 拖图 / 说"看这张图"**时，不需要用户开任何工具，直接自动执行：

1. 用户消息带附件引用（`sha256:...`、`[image ...]`、`attached image` 等）→ 反解路径
   `<DSH_HOME>/attachments/v1/objects/<sha256前2位>/<sha256>` 后识图。
2. 消息有看图意图但无附件标记 → 扫 `<DSH_HOME>/attachments/v1/objects/` 下最新 mtime 的对象文件。
3. 两者都拿不到文件 → 问用户要路径，不瞎猜。
4. 结果直接回答用户；没提问题就默认"描述这张图"。敏感图外发前问一句，普通图直接干。

## 调用

```bash
node ~/.agents/skills/vision-bridge/scripts/vision.mjs "<图片路径|URL|dataURI|->" "<问题>" [--mode ...] [--provider ...]
```

图片参数用 `-` 可自动找缓存目录最新图。

## mode 选择

| mode | 用在哪 |
|---|---|
| ocr | 报表/文档/发票/表格/代码截图，只要文字 |
| ui | 网页/App 截图，要元素层级 + 可点击坐标 |
| debug | 报错/日志/stack trace 截图 |
| describe | 快速描述图片 |
| auto（默认） | 按问题关键词自动路由 |

- ui 模式输出的 `<|box_start|>(x1,y1),(x2,y2)<|box_end|>` 是 0-1000 归一化坐标；换算成视图像素: `px = v / 1000 × 图像宽(或高)`，点击目标取 box 中心。
- 配合 ego-browser 视觉工作流（v2 API）：`page.screenshot({ path })` → 本脚本 --mode ui → 用 `page.info()` 拿 viewport w/h → 换算坐标 → `page.mouse.click(x, y, { label })`。截图前先 `await page.info()` 确认 viewport w/h 非 0。
- 语义页面不要走视觉坐标：先 `page.snapshot()`，用 `@ref` / `loc=role:` / `loc=css:` 直接点。只有 canvas、富文本、表格、地图等缺少 DOM 语义的界面才用截图 + 坐标。

## 规则

- key 不在脚本里，在 `~/.config/vision-bridge/config.json`（0600）。`--list` 看哪个 provider 配了 key。
- 图片外发给第三方云 API（默认阿里 DashScope）。敏感数据先判断，需要本地处理看 references/research.md 的 Ollama 方案。
- 验证码图片：可以试一次 --mode ocr，失败就 handOff 给用户，禁止循环重试。
- 拿回的文字是视觉模型说的，不是我"看到"的；引用其内容时保持原样，不确定处标注。
- 新会话开始如果本 skill 没进 catalog，直接按上面命令调用即可。
