# DSH 装备版 v0.2.4（已公证）

**下载：DSH-Upgrade-Kit-0.2.4.dmg**（macOS 13+，Apple Silicon）

✅ 本版已通过 **Apple 公证**（Developer ID: TECHBOOKS LTD）：下载 → 拖进 Applications → **双击直接打开**，无任何 Gatekeeper 拦截。

给 DeepSeek Harness 的"开箱即用"安装包：双击装上，打开填一个 DeepSeek API key，五件装备全部就位，全程不碰终端。

## v0.2.4 变更

- 菜单栏「DSH 装备版 → 检查更新…」与托盘菜单：手动强制检查更新（Sparkle 自动菜单注入未生效的手动兜底）
- 自动检查频率：每天一次 → 每 4 小时一次

## v0.2.3 变更

- 新增「配置视觉模型…」菜单入口（菜单栏 + 托盘）：弹窗粘贴视觉 API key，自动写入配置（权限 600）
- vision-bridge 未配置时的报错文案改为指引菜单入口（按需触发，不打扰首启流程）

## v0.2.2 变更

- 新增常驻「连接微信」入口：菜单栏「文件 → 连接微信…」与托盘菜单——跳过首启向导或升级后也能随时扫码绑微信

## v0.2.1 变更

- 修复 dsh-cost 侧栏标签：台账无今日数据时回退显示累计值，但标签仍写"今日花费"——现改为标签跟随数据（今日花费 / 累计花费，token 同）

## v0.2.0 变更

- **集成 Sparkle 全自动更新**：App 内自动检查新版本 → 弹窗提示 → 点「立即更新」自动下载、签名校验、替换、重启。以后升级不用再手动下载 DMG
- 更新签名：EdDSA 密钥对（私钥本地保管，公钥内置于 App，更新包被篡改会被拒装）
- 更新通道：GitHub Releases 的 appcast（含公证 zip 更新包）

> 本版起，你只需要保证 App 是 v0.2.0 及以上；之后每次新版发布，App 会自己通知并完成更新。

## v0.1.8 变更

- **修复 dsh-cost 插件模块 ID 不一致**（client bundle 注册 `@deepseek-ai/dsh-cost`，与 cordis 清单 `dsh-cost` 不匹配，导致前端报 "loaded without registering"）——三处 ID 全部统一为 `dsh-cost`，已用全新 DSH_HOME 冷启动验证
- **first-run.sh 幂等**：重复运行不再追加重复 `llm-deepseek` 配置块（先删旧块再写入）
- **不杀在线服务**：3080 已有服务在线时跳过注册重启
- 跳过 v0.1.7（其修复已并入本版）

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
