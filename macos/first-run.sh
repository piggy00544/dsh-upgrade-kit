#!/bin/bash
# first-run.sh — DSH 装备版首次初始化（由 App 壳调用，可重复执行、幂等）。
# 用法：first-run.sh [API_KEY]   （API_KEY 为空则跳过写 key）
set -uo pipefail

API_KEY="${1:-}"
BASE_URL="${2:-}"
MODEL_ID="${3:-}"
PROTOCOL="${4:-deepseek}"
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"            # Contents/Resources/.. = App 根
RES="$APP_DIR/Contents/Resources"
TPL="$RES/home-template"
USER_BASE="$HOME/Library/Application Support/DSH-Upgrade-Kit"
HOME_DIR="$USER_BASE/home"
LOG="$USER_BASE/first-run.log"

mkdir -p "$USER_BASE"
exec >>"$LOG" 2>&1
echo "===== first-run $(date) ====="

# ---- 1. 初始化 home ----
if [ ! -d "$HOME_DIR" ]; then
  cp -R "$TPL" "$HOME_DIR"
  echo "✔ home 已初始化 → $HOME_DIR"
else
  echo "· home 已存在，跳过拷贝"
fi

# ---- 2.5 插件代码同步（幂等）：升级 App 后插件修复随之生效，不碰用户数据 ----
# web 插件实体
cp -R "$TPL/profiles/web/node_modules/." "$HOME_DIR/profiles/web/node_modules/" 2>/dev/null || true
# cordis patch（从模板恢复后再替换路径占位）
cp "$TPL/profiles/web/cordis.patch.yml" "$HOME_DIR/profiles/web/cordis.patch.yml" 2>/dev/null || true
# skills（vision-bridge 等）
cp -R "$TPL/skills/." "$HOME_DIR/skills/" 2>/dev/null || true
# headless bundle（含持久会话补丁）
rm -rf "$HOME_DIR/profiles/headless/node_modules/@deepseek-ai/dsh-headless" 2>/dev/null || true
cp -R "$TPL/profiles/headless/node_modules/." "$HOME_DIR/profiles/headless/node_modules/" 2>/dev/null || true
echo "· 插件代码已同步（若 App 已更新）"
# 重启 web 服务让新插件代码生效（App 壳探测到掉线会自动重新拉起）
pkill -f "DSH 装备版.app/Contents/MacOS/dsh web" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/com.dsh-upgrade.dsh-web" 2>/dev/null || true

# ---- 2. cordis.patch.yml 路径替换（幂等）----
PATCH="$HOME_DIR/profiles/web/cordis.patch.yml"
PLUGINS_DIR="$RES/plugins"
if grep -q "__PLUGINS_DIR__" "$PATCH" 2>/dev/null; then
  sed -i '' "s|__PLUGINS_DIR__|$PLUGINS_DIR|g" "$PATCH"
  echo "✔ cordis.patch.yml 路径已替换 → $PLUGINS_DIR"
else
  echo "· cordis.patch.yml 无需替换"
fi

# ---- 3. 写 API key ----
if [ -n "$API_KEY" ]; then
  printf 'DEEPSEEK_API_KEY: %s\n' "$API_KEY" > "$HOME_DIR/.credentials.yaml"
  chmod 600 "$HOME_DIR/.credentials.yaml"
  echo "✔ API key 已写入（0600）"
else
  chmod 600 "$HOME_DIR/.credentials.yaml" 2>/dev/null || true
  echo "· 跳过 key（稍后在设置里填）"
fi

# ---- 3.5 自定义 API 端点与协议（幂等：先删旧块再写）----
if [ -n "$BASE_URL" ] || [ -n "$MODEL_ID" ]; then
  # 删除旧的 llm-deepseek 与 llm-pi-ai 块（防重复 key）
  python3 - "$HOME_DIR/settings.yaml" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
for key in ("llm-deepseek:", "llm-pi-ai:"):
    idx = s.find(key)
    while idx >= 0:
        head = s[:idx].rstrip()
        body = s[idx:]
        lines = body.split("\n")
        end = len(lines)
        for i, ln in enumerate(lines[1:], 1):
            if ln and not ln[0].isspace() and ":" in ln and not ln.startswith("#"):
                end = i
                break
        s = head + "\n" + "\n".join(lines[end:]) if head else "\n".join(lines[end:])
        idx = s.find(key)
open(p, "w").write(s)
PY

  if [ "$PROTOCOL" = "openai-completions" ]; then
    # ---- OpenAI Completions 协议：llm-pi-ai 路由（内部网关推荐）----
    ROUTE="internal"
    CRED_ENV="INTERNAL_API_KEY"
    # 凭据：只写协议对应的环境变量名
    printf '%s: %s\n' "$CRED_ENV" "$API_KEY" > "$HOME_DIR/.credentials.yaml"
    chmod 600 "$HOME_DIR/.credentials.yaml"
    {
      echo ""
      echo "llm-pi-ai:"
      echo "  providers:"
      echo "    $ROUTE:"
      echo "      apiKeyEnv: $CRED_ENV"
      echo "      displayName: 内部网关"
      echo "      baseURL: '$BASE_URL'"
      echo "      api: openai-completions"
      if [ -n "$MODEL_ID" ]; then
        echo "      models:"
        echo "$MODEL_ID" | tr ',' '\n' | while IFS= read -r mid; do
          [ -z "$mid" ] && continue
          echo "        - id: '$mid'"
          echo "          name: '$mid'"
        done
      fi
    } >> "$HOME_DIR/settings.yaml"
    # 默认模型走该路由
    FIRST_MODEL="$(echo "$MODEL_ID" | tr ',' '\n' | head -1)"
    sed -i '' "s/  provider: deepseek-official/  provider: $ROUTE/" "$HOME_DIR/settings.yaml"
    [ -n "$MODEL_ID" ] && sed -i '' "s/  model: deepseek-v4-pro/  model: $FIRST_MODEL/" "$HOME_DIR/settings.yaml"
    echo "✔ 已按 OpenAI Completions 协议写入（路由 $ROUTE，凭据 $CRED_ENV）"
  else
    # ---- DeepSeek 官方协议：llm-deepseek 段（原有逻辑）----
    {
      echo ""
      echo "llm-deepseek:"
      [ -n "$BASE_URL" ] && echo "  baseURL: '$BASE_URL'"
      if [ -n "$MODEL_ID" ]; then
        echo "  models:"
        echo "$MODEL_ID" | tr ',' '\n' | while IFS= read -r mid; do
          [ -z "$mid" ] && continue
          echo "    - id: '$mid'"
          echo "      name: '$mid'"
        done
      fi
    } >> "$HOME_DIR/settings.yaml"
    # 默认模型跟随第一个内部模型 ID
    if [ -n "$MODEL_ID" ]; then
      FIRST_MODEL="$(echo "$MODEL_ID" | tr ',' '\n' | head -1)"
      sed -i '' "s/  model: deepseek-v4-pro/  model: $FIRST_MODEL/" "$HOME_DIR/settings.yaml"
    fi
    echo "✔ 自定义端点已写入 settings.yaml（baseURL=$BASE_URL modelId=$MODEL_ID）"
  fi
fi

# ---- 4. LaunchAgent：web 服务 ----
mkdir -p "$HOME/Library/LaunchAgents"
WEB_PLIST="$HOME/Library/LaunchAgents/com.dsh-upgrade.dsh-web.plist"
cat > "$WEB_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dsh-upgrade.dsh-web</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_DIR/Contents/MacOS/dsh</string>
    <string>web</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>3080</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DSH_HOME</key><string>$HOME_DIR</string>
    <key>DSH_TELEMETRY_DISABLED</key><string>1</string>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$USER_BASE/web.log</string>
  <key>StandardErrorPath</key><string>$USER_BASE/web.err.log</string>
</dict></plist>
PLIST
if curl -s -o /dev/null -m 2 "http://127.0.0.1:3080/" 2>/dev/null; then
  echo "· 3080 已有服务在线，跳过注册重启"
else
  launchctl bootout "gui/$(id -u)/com.dsh-upgrade.dsh-web" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$WEB_PLIST" 2>/dev/null || true
  echo "✔ web 服务 LaunchAgent 已注册"
fi

# ---- 5. 微信双向通道 ----
BRIDGE="$USER_BASE/bridges/wechat-bridge"
mkdir -p "$HOME/bin"
for f in dsh-wechat.mjs dsh-wechat-daemon.mjs dsh-notify dsh-notify-wechat; do
  [ -f "$BRIDGE/$f" ] && cp "$BRIDGE/$f" "$HOME/bin/$f" && chmod +x "$HOME/bin/$f"
done
echo "✔ 微信桥脚本已装 → ~/bin"

DAEMON_PLIST="$HOME/Library/LaunchAgents/com.dsh-upgrade.wechat-daemon.plist"
NODE_BIN="$APP_DIR/Contents/MacOS/node/bin/node"
cat > "$DAEMON_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dsh-upgrade.wechat-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$BRIDGE/dsh-wechat-daemon.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$APP_DIR/Contents/MacOS:$HOME/bin:/usr/bin:/bin</string>
    <key>DSH_BIN</key><string>$APP_DIR/Contents/MacOS/dsh</string>
    <key>DSH_WECHAT_CWD</key><string>$HOME</string>
    <key>DSH_HOME</key><string>$HOME_DIR</string>
    <key>DSH_NOTIFY_BIN</key><string>$HOME/bin/dsh-notify</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$USER_BASE/wechat-daemon.log</string>
  <key>StandardErrorPath</key><string>$USER_BASE/wechat-daemon.err.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/com.dsh-upgrade.wechat-daemon" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DAEMON_PLIST" 2>/dev/null || true
echo "✔ 微信收件守护已注册（登录：$HOME/bin/dsh-wechat.mjs login）"

# ---- 6. vision-bridge 配置提示 ----
if [ ! -f "$HOME/.config/vision-bridge/config.json" ]; then
  mkdir -p "$HOME/.config/vision-bridge"
  cp "$HOME_DIR/skills/vision-bridge/config.example.json" "$HOME/.config/vision-bridge/config.json"
  chmod 600 "$HOME/.config/vision-bridge/config.json"
  echo "· vision-bridge 已生成空白配置（要看图需自行填视觉 API key）"
fi

echo "===== first-run 完成 ====="
exit 0
