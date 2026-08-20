#!/usr/bin/env bash
# build.sh — 组装「DSH 装备版.app」并打 DMG。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
KIT_ROOT="$(cd "$HERE/.." && pwd)"
APP_NAME="DSH 装备版"
APP="$HERE/dist/$APP_NAME.app"
DSH_PKG_PREFIX="/Users/shan/Library/Application Support/DeepSeek Harness Lab/npm-rc8"
NODE_TAR="/tmp/node-v22.22.0-darwin-arm64.tar.xz"
VERSION="${VERSION:-0.2.0}"

echo "==> 1/7 生成 home-template"
bash "$HERE/generate-home-template.sh"

echo "==> 2/7 组装 .app 骨架"
rm -rf "$HERE/dist"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "==> 3/7 编译 Swift 壳"
swiftc -O -target arm64-apple-macos13.0 "$HERE/DSHUpgrade/main.swift" \
  -o "$APP/Contents/MacOS/DSHUpgrade" \
  -F "$HERE/vendor" \
  -framework Cocoa -framework WebKit -framework Carbon -framework UserNotifications -framework Sparkle \
  -Xlinker -rpath -Xlinker "@loader_path/../Frameworks"
echo "    swiftc OK"
mkdir -p "$APP/Contents/Frameworks"
cp -R "$HERE/vendor/Sparkle.framework" "$APP/Contents/Frameworks/"
echo "    Sparkle framework OK"

echo "==> 4/7 拷贝运行时（node + dsh）"
# node 官方运行时
if [ ! -f "$NODE_TAR" ]; then
  curl -sL -o "$NODE_TAR" "https://nodejs.org/dist/v22.22.0/node-v22.22.0-darwin-arm64.tar.xz"
fi
rm -rf /tmp/node-unpack && mkdir -p /tmp/node-unpack
tar -xJf "$NODE_TAR" -C /tmp/node-unpack --strip-components=1
mkdir -p "$APP/Contents/MacOS/node"
cp -R /tmp/node-unpack/bin /tmp/node-unpack/lib "$APP/Contents/MacOS/node/"
echo "    node runtime OK"

# dsh npm 包 + 依赖（自包含 dsh-base/dsh-web-app/dsh-headless 等全部 bundle）
mkdir -p "$APP/Contents/Resources/dsh-runtime"
cp -R "$DSH_PKG_PREFIX/lib" "$APP/Contents/Resources/dsh-runtime/"
echo "    dsh runtime OK"

# dsh 启动器（供 LaunchAgent / 命令行调用）
cat > "$APP/Contents/MacOS/dsh" <<'SH'
#!/bin/sh
# DSH 装备版 launcher：App 内自带 node + dsh 运行时，DSH_HOME 指向用户数据目录。
APPDIR="$(cd "$(dirname "$0")/.." && pwd)"
export DSH_HOME="${DSH_HOME:-$HOME/Library/Application Support/DSH-Upgrade-Kit/home}"
export DSH_TELEMETRY_DISABLED=1
exec "$APPDIR/MacOS/node/bin/node" "$APPDIR/Resources/dsh-runtime/lib/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"
SH
chmod +x "$APP/Contents/MacOS/dsh"
echo "    dsh launcher OK"

echo "==> 5/7 拷贝资源（模板 / 插件 / 初始化脚本）"
cp -R "$HERE/home-template" "$APP/Contents/Resources/"
cp "$HERE/first-run.sh" "$APP/Contents/Resources/"
chmod +x "$APP/Contents/Resources/first-run.sh"

# 公众号二维码（向导页作者区块）
cp "$HERE/assets/qrcode-wechat.jpg" "$APP/Contents/Resources/qrcode-wechat.jpg" 2>/dev/null || true
echo "    qrcode OK"

# research-mcp + 依赖（npm install 用 lockfile）
mkdir -p "$APP/Contents/Resources/plugins"
cp -R "$KIT_ROOT/plugins/research-mcp" "$APP/Contents/Resources/plugins/"
(cd "$APP/Contents/Resources/plugins/research-mcp" && npm install --omit=dev --silent)
cp -R "$KIT_ROOT/plugins/wechat-bridge" "$APP/Contents/Resources/plugins/"
echo "    plugins OK"

echo "==> 6/7 图标与 Info.plist"
# 从封面生成多尺寸 iconset
ICONSET="$HERE/work/icon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
SRC="$HERE/assets/app-icon.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2))
  sips -z $d $d "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
echo "    icon OK"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>DSH 装备版</string>
  <key>CFBundleDisplayName</key><string>DSH 装备版</string>
  <key>CFBundleIdentifier</key><string>com.piggy00544.dsh-upgrade-kit</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleExecutable</key><string>DSHUpgrade</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSUserNotificationUsageDescription</key><string>用于向你发送任务完成与微信桥状态通知。</string>
  <key>SUFeedURL</key><string>https://github.com/piggy00544/dsh-upgrade-kit/releases/latest/download/appcast.xml</string>
  <key>SUEnableAutomaticChecks</key><true/>
  <key>SUPublicEDKey</key><string>L2KcNo/KrFRb5hZJjyW6Zeygpa+sr3BDyZb27h8xYJs=</string>
  <key>CFBundleURLTypes</key>
  <array><dict>
    <key>CFBundleURLName</key><string>DSH 装备版通知</string>
    <key>CFBundleURLSchemes</key><array><string>dsh</string></array>
  </dict></array>
</dict></plist>
PLIST

# adhoc 签名：先拷贝到本地目录（iCloud 目录的 Finder 元数据会让 codesign 报 detritus）
BUILD_LOCAL="/tmp/dsh-build"
rm -rf "$BUILD_LOCAL" && mkdir -p "$BUILD_LOCAL"
cp -R "$APP" "$BUILD_LOCAL/"
APP_LOCAL="$BUILD_LOCAL/$APP_NAME.app"
xattr -cr "$APP_LOCAL" 2>/dev/null || true
codesign --force --deep --sign - "$APP_LOCAL" 2>/dev/null || codesign --force --deep --sign - "$APP_LOCAL"
echo "    签名 OK"

echo "==> 7/7 打 DMG（手动 hdiutil，含拖拽链接）"
rm -rf "$BUILD_LOCAL/staging" && mkdir -p "$BUILD_LOCAL/staging"
cp -R "$APP_LOCAL" "$BUILD_LOCAL/staging/"
ln -s /Applications "$BUILD_LOCAL/staging/Applications"
printf '把「DSH 装备版」拖进 Applications 即可。\n首次打开：右键 → 打开（未公证应用的 macOS 提示）。\n' > "$BUILD_LOCAL/staging/安装说明.txt"
DMG="$BUILD_LOCAL/DSH-Upgrade-Kit-$VERSION.dmg"
rm -f "$DMG"
hdiutil create -volname "DSH 装备版" -srcfolder "$BUILD_LOCAL/staging" -ov -format UDZO "$DMG" >/dev/null 2>&1
echo "DMG: $DMG"

# 产物拷贝到工作区 dist（不留在 /tmp）
mkdir -p "$HERE/dist"
cp "$DMG" "$HERE/dist/"
cp -R "$APP_LOCAL" "$HERE/dist/" 2>/dev/null || true

echo ""
echo "===== 打包完成 ====="
du -sh "$APP_LOCAL" "$DMG"
