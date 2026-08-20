# dsh-wechat-bridge — 微信双向通道

让 DSH 和你的微信直连：**微信里给 bot 发消息 → 本机 headless 会话执行 → 结果回微信**；同时 agent 也能主动推消息到你的微信（系统通知同理）。持久记忆：微信桥用一个固定会话，聊过的上下文一直在，说"清空记忆"即可重置。

## 能力

| 方向 | 组件 | 说明 |
|---|---|---|
| 微信 → DSH | `dsh-wechat-daemon.mjs` | 常驻守护，长轮询微信 iLink bot 接口；只认**扫码登录人**的消息（白名单）；每条消息转成 `dsh --profile headless "<消息>"` 执行，结果回传（最多 3800 字，超时 15 分钟） |
| DSH → 微信 | `dsh-wechat.mjs` / `dsh-notify-wechat` | 零依赖直连 iLink bot API（无 OpenClaw/中转）；agent 随时 `dsh-notify-wechat "标题" "内容"` 推送到你的微信 |
| 系统通知 | `dsh-notify` | macOS 通知中心（App 运行时点击可唤起窗口） |
| 会话管理 | 固定 session + 自动挂 WebUI | 每次微信任务后，会话经 web RPC 挂进 DSH 工作区 → **WebUI 侧边栏可见可续写**；微信说"清空记忆/重置会话"即删会话换新 |
| 持久记忆补丁 | `patch-headless.mjs` | 给 headless bundle 打一行补丁，让 `DSH_HEADLESS_SESSION_ID` 环境变量固定会话 id（幂等，可重复跑） |

## 安装

```bash
# 1) 拷脚本到 ~/bin（或任意 PATH 目录）
cp dsh-wechat.mjs dsh-wechat-daemon.mjs dsh-notify dsh-notify-wechat ~/bin/
chmod +x ~/bin/dsh-notify ~/bin/dsh-notify-wechat

# 2) 打 headless 持久会话补丁（幂等）
node patch-headless.mjs

# 3) 装 macOS LaunchAgent（开机自启 + 崩溃自动拉起）
sed -e "s|__KIT_HOME__|$PWD|g" -e "s|__HOME__|$HOME|g" -e "s|__NODE_BIN__|$(which node)|g" \
  com.deepseek.dsh-wechat-daemon.plist.template \
  > ~/Library/LaunchAgents/com.deepseek.dsh-wechat-daemon.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.deepseek.dsh-wechat-daemon.plist

# 4) 扫码登录（一次性）
~/bin/dsh-wechat.mjs login
```

装完在微信里给登录的 bot 发"hi"，应该会先收到"🤖 收到，处理中…"，随后收到执行结果。

## 配置（环境变量，daemon 均支持覆盖）

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSH_BIN` | `which dsh` | dsh CLI 路径 |
| `DSH_WECHAT_CWD` | `$HOME` | headless 任务的工作目录（决定 WebUI 里挂在哪个工作区） |
| `DSH_WEB_URL` | `http://127.0.0.1:3080` | DSH web 服务地址（用于挂会话） |
| `DSH_NOTIFY_BIN` | `/opt/homebrew/bin/dsh-notify` | 系统通知脚本路径 |
| `DSH_HOME` | 自动探测 | harness 主目录（sessions 存储） |

## 安全

- 凭证存 `~/.local/share/dsh-wechat/credentials.json`（0600），代码里零硬编码密钥
- 白名单 = 扫码登录人的 `ilink_user_id`，其他人发的消息只记日志不执行
- 只处理 5 分钟内的新消息，防积压重放
- 会话过期（ret=-14）时弹系统通知提醒重新扫码，不会静默挂掉

## 已知边界

- 微信侧图片/语音消息暂不处理（只收文本）
- 回复上限 3800 字，超出截断
- headless 补丁依赖 bundle 源码行；DSH 升级若改动该行，重跑 `patch-headless.mjs` 即可（找不到目标文本会明确报错）
- 直连的是微信 iLink bot 官方接口；如接口行为变化，更新 `dsh-wechat.mjs` 的端点常量即可

## 许可

MIT License
