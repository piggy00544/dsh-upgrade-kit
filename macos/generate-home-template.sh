#!/usr/bin/env bash
# generate-home-template.sh — 生成预置五件装备的干净 DSH home 模板。
# 产物：macos/home-template/（首次启动时由安装器拷贝到用户目录并做路径替换）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
KIT_ROOT="$(cd "$HERE/.." && pwd)"
TPL="$HERE/home-template"
DSH_PKG="/Users/shan/Library/Application Support/DeepSeek Harness Lab/npm-rc8/lib/node_modules/@deepseek-ai/dsh"

rm -rf "$TPL"
mkdir -p "$TPL/profiles/web" "$TPL/profiles/headless" "$TPL/skills" "$TPL/logs"

# ---- 1. 全局配置 ----
cat > "$TPL/settings.yaml" <<'YAML'
ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-pro
  reasoningEffort: max
permission:
  defaultPreset: danger-full-access
YAML

# key 占位（首次启动向导写入真实值）
printf 'DEEPSEEK_API_KEY: \n' > "$TPL/.credentials.yaml"
chmod 600 "$TPL/.credentials.yaml"

# ---- 2. web profile ----
cat > "$TPL/profiles/web/cordis.yml" <<'YAML'
[]
YAML

# cordis.patch.yml：三个 cordis 插件。__PLUGINS_DIR__ 在安装时替换为 App 内实际路径。
cat > "$TPL/profiles/web/cordis.patch.yml" <<'YAML'
# DSH 装备版预置插件（由安装器生成）

# 外网搜集：国际搜索（DDG/Bing 国际版，走代理）+ 全文抓取 + 站点经验。
# 注册后模型侧工具名：mcp__research__search / mcp__research__fetch / mcp__research__site_hint。
- insert:
    - id: mcp-research
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: research
        transport: stdio
        command: !!js process.execPath
        args:
          - '__PLUGINS_DIR__/research-mcp/server.mjs'
        toolCallTimeoutMs: 90000
        failOnStartupError: false

# 会话附件预览：会话头部"附件"按钮 → 右侧预览面板（附件列表 + 按类型预览）。
- insert:
    - id: file-preview
      name: 'dsh-plugin-file-preview'

# 用量与费用面板：侧栏底部 ¥ 按钮 → 仪表盘（余额 + token + 峰谷计价）。
- insert:
    - id: dsh-cost
      name: 'dsh-cost'
YAML

cat > "$TPL/profiles/web/package.json" <<'JSON'
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-cost": "0.1.0",
    "dsh-plugin-file-preview": "0.2.0"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ]
    }
  }
}
JSON

cat > "$TPL/profiles/web/pnpm-workspace.yaml" <<'YAML'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
YAML

# 插件实体（手摆 node_modules，不依赖 pnpm/link）
mkdir -p "$TPL/profiles/web/node_modules/dsh-cost" "$TPL/profiles/web/node_modules/dsh-plugin-file-preview"
cp -R "$KIT_ROOT/plugins/dsh-cost/." "$TPL/profiles/web/node_modules/dsh-cost/"
cp -R "$KIT_ROOT/plugins/dsh-plugin-file-preview/." "$TPL/profiles/web/node_modules/dsh-plugin-file-preview/"

# ---- 3. headless profile（微信桥的固定会话补丁打在实体上）----
cat > "$TPL/profiles/headless/cordis.yml" <<'YAML'
[]
YAML

cat > "$TPL/profiles/headless/package.json" <<'JSON'
{
  "name": "dsh-profile-headless",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-headless"
      ]
    }
  }
}
JSON

mkdir -p "$TPL/profiles/headless/node_modules/@deepseek-ai"
cp -R "$DSH_PKG/node_modules/@deepseek-ai/dsh-headless" "$TPL/profiles/headless/node_modules/@deepseek-ai/dsh-headless"
# 打固定会话补丁（微信桥持久记忆）
HEADLESS_IDX="$TPL/profiles/headless/node_modules/@deepseek-ai/dsh-headless/lib/index.js"
if grep -q "DSH_HEADLESS_SESSION_ID" "$HEADLESS_IDX"; then
  echo "✔ headless 补丁已存在"
else
  sed -i '' 's|sessionId: SessionId(`session-${randomUUID()}`),|sessionId: SessionId(process.env.DSH_HEADLESS_SESSION_ID \|\| `session-${randomUUID()}`),|' "$HEADLESS_IDX"
  echo "✔ headless 补丁已打"
fi

# ---- 4. skills：vision-bridge ----
cp -R "$KIT_ROOT/skills/vision-bridge" "$TPL/skills/vision-bridge"

# ---- 5. 微信桥 + 插件资源（放进 App 资源，home 里只留 patch 引用）----
mkdir -p "$TPL/bridges"
cp -R "$KIT_ROOT/plugins/wechat-bridge" "$TPL/bridges/wechat-bridge"

echo "✔ home-template 生成完成："
find "$TPL" -maxdepth 3 -not -path "*/node_modules/*" | sort | sed "s|$HERE/||"
