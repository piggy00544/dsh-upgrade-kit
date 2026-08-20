# DSH 装备版 v0.1.0

**下载：DSH-Upgrade-Kit-0.1.0.dmg**（macOS 13+，Apple Silicon）

给 DeepSeek Harness 的"开箱即用"安装包：双击装上，打开填一个 DeepSeek API key，五件装备全部就位，全程不碰终端。

## 一键获得

1. 下载 DMG → 打开 → 把「DSH 装备版」拖进 Applications
2. 首次打开：右键 App → 打开（未公证应用的 macOS 提示，一次性）
3. 填 DeepSeek API key → 点「开始使用」→ 自动初始化约 1 分钟 → 进入 DSH

## 装了什么

| 装备 | 入口 |
|---|---|
| 💰 **dsh-cost** 用量与费用面板 | 侧栏底部 ¥ 按钮：真实余额 + token 消耗 + 峰谷计价 |
| 📄 **dsh-plugin-file-preview** 文件预览 | 会话头部「附件」按钮 + 回复尾部产物卡片 + 拖拽上传 |
| 🌐 **dsh-research-mcp** 外网搜集 | 模型自动获得 search / fetch / site_hint 三个工具，零 API key |
| 👁 **vision-bridge** 视觉桥接 | 贴图说"看这张图"自动触发（需自填视觉 API key，阿里百炼限免） |
| 💬 **dsh-wechat-bridge** 微信双向通道 | 终端跑 `~/bin/dsh-wechat.mjs login` 扫码后，微信里发消息即可指挥 DSH |

- DSH 本体、node 运行时全部内嵌，**无需安装 Node/pnpm/任何依赖**
- 服务由 LaunchAgent 守护，开机自启；App 关窗口常驻菜单栏，⌥⇧Space 全局唤起
- 与原版 DSH 共存不冲突（独立 bundle id、独立 LaunchAgent label）

## 安全与隐私

- API key 只写本机 `~/Library/Application Support/DSH-Upgrade-Kit/home/.credentials.yaml`（权限 600），绝不上传
- 费用台账、会话文件全部本地；仅视觉桥接外发图片到自选云端视觉模型
- 未做 Apple 公证（需付费开发者账号），源码全部公开可自行构建

## 已知问题

- 首次打开需右键 → 打开（Gatekeeper）
- 微信桥图片/语音消息暂不处理（只收文本）
- 与本机已装原版 DSH 共用 3080 端口时，先启动者占用

## 源码与构建

```bash
git clone https://github.com/piggy00544/dsh-upgrade-kit.git
cd dsh-upgrade-kit/macos
# 修改 build.sh 顶部 DSH_PKG_PREFIX 指向本机 dsh npm 安装位置后：
bash build.sh
```
