# DSH 装备版 v0.1.6（已公证）

**下载：DSH-Upgrade-Kit-0.1.6.dmg**（macOS 13+，Apple Silicon）

✅ 本版已通过 **Apple 公证**（Developer ID: TECHBOOKS LTD）：下载 → 拖进 Applications → **双击直接打开**，无任何 Gatekeeper 拦截。

给 DeepSeek Harness 的"开箱即用"安装包：双击装上，打开填一个 DeepSeek API key，五件装备全部就位，全程不碰终端。

## v0.1.6 变更

- **App 自管服务**：打开 App 自动拉起 DSH 服务，不再依赖系统自启注册（此前部分机器因文件夹权限注册失败需手动起服务，现已绕开）
- **修复误弹向导**：内部网关 key 无 sk- 前缀被误判为"未配置"，改为按 key 非空判断
- **新 App 图标**：🤖 机器人 emoji（深色圆角底）
- 跳过 v0.1.5（其修复已并入本版）

## v0.1.4 变更

- **关键修复**：node 运行时补齐 JIT entitlements——此前公证重签后 dsh 服务启动即崩溃（SIGTRAP），现已修复并实测服务可启动

## v0.1.3 变更

- 向导高级选项支持**多个内部模型**（逗号分隔，选择器全部展示，默认选第一个）
- 修复最低系统要求（此前误标 macOS 27+，现为 **macOS 13+**，Tahoe 26 可装）
- 向导首页新增作者曝光区：公众号「牛村木木山」二维码与关注引导

## v0.1.2 变更

- **通过 Apple 公证**：无需右键 → 打开，双击即用（内含公证票据 + 安全时间戳）
- 全量代码签名：App 内 11 个 Mach-O（含 node 运行时、原生插件、dylib）全部 Developer ID 签名

## v0.1.1 新增

- 向导第二步：**微信扫码页**（App 内显示二维码，扫码即连，不用碰终端）
- 向导第一步：**高级选项**（自定义 API 地址 + 模型 ID）——公司内部部署的 DeepSeek 网关直接填表接入，key 无格式要求
- dsh-wechat 新增 `qr` / `check` JSON 子命令（GUI 驱动）

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

- 微信桥图片/语音消息暂不处理（只收文本）
- 与本机已装原版 DSH 共用 3080 端口时，先启动者占用

## 源码与构建

```bash
git clone https://github.com/piggy00544/dsh-upgrade-kit.git
cd dsh-upgrade-kit/macos
# 修改 build.sh 顶部 DSH_PKG_PREFIX 指向本机 dsh npm 安装位置后：
bash build.sh
```
