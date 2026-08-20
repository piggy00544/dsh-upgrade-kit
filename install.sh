#!/usr/bin/env bash
# dsh-upgrade-kit 一键安装：token 花费面板 + 文件预览 + 外网搜集 + 视觉桥接
# 用法：curl -fsSL https://raw.githubusercontent.com/piggy00544/dsh-upgrade-kit/main/install.sh | bash
set -euo pipefail

KIT_HOME="${DSH_UPGRADE_KIT_HOME:-$HOME/.local/share/dsh-upgrade-kit}"
REPO_URL="https://github.com/piggy00544/dsh-upgrade-kit.git"
PROFILE="${DSH_PROFILE:-web}"
SKILL_DIR="$HOME/.agents/skills"

say()  { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m⚠\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*"; exit 1; }

# ---- 0. 前置检查 ----
command -v dsh >/dev/null 2>&1 || die "未找到 dsh 命令，请先安装 DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness"

# ---- 1. 定位 DSH_HOME ----
if [ -z "${DSH_HOME:-}" ]; then
  for cand in \
    "$HOME/Library/Application Support/DeepSeek Harness Lab/home" \
    "$HOME/.dsh" "$HOME/.config/dsh" "$HOME/.deepseek-harness"; do
    if [ -d "$cand/profiles" ]; then DSH_HOME="$cand"; break; fi
  done
fi
[ -n "${DSH_HOME:-}" ] || die "找不到 DSH_HOME（profiles 目录）。请手动执行：DSH_HOME=/你的路径 bash install.sh"
say "DSH_HOME = $DSH_HOME"

PATCH_FILE="$DSH_HOME/profiles/$PROFILE/cordis.patch.yml"
[ -f "$PATCH_FILE" ] || die "找不到 $PATCH_FILE（profile '$PROFILE' 不存在？）"

# ---- 2. 取仓库 ----
if [ -d "$KIT_HOME/.git" ]; then
  say "仓库已存在，更新中…"
  git -C "$KIT_HOME" pull --ff-only --quiet
else
  say "克隆仓库到 $KIT_HOME …"
  git clone --depth 1 "$REPO_URL" "$KIT_HOME"
fi

# ---- 3. cordis 插件：dsh-cost + file-preview ----
for pkg in dsh-cost dsh-plugin-file-preview; do
  if dsh plugin --profile "$PROFILE" add "link:$KIT_HOME/plugins/$pkg" >/dev/null 2>&1; then
    say "插件 $pkg 已安装"
  else
    warn "插件 $pkg 安装失败（可能已装过，跳过）"
  fi
done

# ---- 4. research-mcp：装依赖 ----
(cd "$KIT_HOME/plugins/research-mcp" && npm install --omit=dev --silent)
say "research-mcp 依赖已就绪"

# ---- 5. 幂等 patch cordis.patch.yml ----
append_patch() { # $1 = 待插入 YAML 块，$2 = 标识 id
  if grep -q "$2" "$PATCH_FILE" 2>/dev/null; then
    warn "patch 已存在（$2），跳过"
    return 0
  fi
  printf '%s\n' "$1" >> "$PATCH_FILE"
  say "已写入 patch：$2"
}

append_patch "- insert:
    - id: file-preview
      name: 'dsh-plugin-file-preview'
" "id: file-preview"

append_patch "- insert:
    - id: dsh-cost
      name: 'dsh-cost'
" "id: dsh-cost"

append_patch "- insert:
    - id: mcp-research
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: research
        transport: stdio
        command: !!js process.execPath
        args:
          - '$KIT_HOME/plugins/research-mcp/server.mjs'
        toolCallTimeoutMs: 90000
        failOnStartupError: false
" "id: mcp-research"

# ---- 6. vision-bridge skill ----
mkdir -p "$SKILL_DIR"
if [ -d "$SKILL_DIR/vision-bridge" ]; then
  warn "vision-bridge 技能已存在，跳过"
else
  cp -R "$KIT_HOME/skills/vision-bridge" "$SKILL_DIR/"
  say "vision-bridge 技能已安装到 $SKILL_DIR/vision-bridge"
fi

# ---- 7. wechat-bridge：微信双向通道 ----
BIN_DIR="$HOME/bin"
mkdir -p "$BIN_DIR"
for f in dsh-wechat.mjs dsh-wechat-daemon.mjs dsh-notify dsh-notify-wechat; do
  if [ ! -f "$BIN_DIR/$f" ]; then
    cp "$KIT_HOME/plugins/wechat-bridge/$f" "$BIN_DIR/"
    chmod +x "$BIN_DIR/$f"
    say "已安装 $f → $BIN_DIR"
  else
    warn "$f 已存在，跳过"
  fi
done

# headless 持久会话补丁（幂等）
node "$KIT_HOME/plugins/wechat-bridge/patch-headless.mjs" || warn "headless 补丁未打上（不影响其他组件，详见 wechat-bridge README）"

# macOS LaunchAgent（微信收件守护）
if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  PLIST="$HOME/Library/LaunchAgents/com.deepseek.dsh-wechat-daemon.plist"
  if [ ! -f "$PLIST" ]; then
    mkdir -p "$HOME/Library/LaunchAgents"
    NODE_BIN="$(command -v node || echo /opt/homebrew/bin/node)"
    sed -e "s|__KIT_HOME__|$KIT_HOME|g" -e "s|__HOME__|$HOME|g" -e "s|__NODE_BIN__|$NODE_BIN|g" \
      "$KIT_HOME/plugins/wechat-bridge/com.deepseek.dsh-wechat-daemon.plist.template" > "$PLIST"
    launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    say "微信收件守护已注册（开机自启）"
  else
    warn "LaunchAgent 已存在，跳过"
  fi
fi

# ---- 8. 收尾 ----
cat <<'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  全部完成！还差最后三步：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) 重启 DSH web（macOS 常用方式）：
   launchctl kickstart -k gui/$(id -u)/com.deepseek.dsh-web
   或直接重启你的 dsh web 进程
2) 配置 vision-bridge 的视觉 API key（可选但推荐）：
   cp ~/.agents/skills/vision-bridge/config.example.json \
      ~/.config/vision-bridge/config.json
   chmod 600 ~/.config/vision-bridge/config.json
   # 编辑填入任一 provider 的 apiKey（阿里百炼/硅基流动/智谱/MiniMax）
3) 微信扫码（可选）：~/bin/dsh-wechat.mjs login
   微信里给登录的 bot 发消息即可指挥 DSH，结果自动回微信

重启后：
• 侧栏底部出现 ¥ 按钮 → 用量与费用面板
• 会话头部出现「附件」按钮 → 文件预览面板
• 模型多出 mcp__research__search / fetch / site_hint 三个搜集工具
• 贴图说"看这张图" → 自动走视觉桥接
• 微信发消息 → 本机执行 → 结果回微信（会话挂进 WebUI）
EOF
