#!/usr/bin/env bash
# release.sh — DSH 装备版发布管线：构建 → 公证 → zip 更新包 → appcast → DMG → GitHub Release。
# Sparkle 私钥在钥匙串（generate_keys 生成过），appcast 由 generate_appcast 自动签名。
# 用法：VERSION=0.2.0 [FORCE=1] bash release.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="/tmp/dsh-build/DSH 装备版.app"
ID="${DEVELOPER_ID_NAME:-Developer ID Application: TECHBOOKS LTD (M953F4AZL8)}"
PROFILE="${NOTARY_PROFILE:-dsh-notary-profile}"
VERSION="${VERSION:-0.2.0}"
SPARKLE_BIN="/tmp/sparkle/bin"
FEED_NAME="appcast.xml"
RELEASE_DIR="/tmp/dsh-release"

echo "==> 0/7 构建"
[ -d "$APP" ] && [ -z "${FORCE:-}" ] || bash "$HERE/build.sh"

echo "==> 1/7 全量签名（node 带 JIT entitlements）"
ENT="$HERE/assets/node-entitlements.plist"
find "$APP" -type f > /tmp/all-files.txt
file -f /tmp/all-files.txt 2>/dev/null | grep "Mach-O" | cut -d: -f1 > /tmp/macho-list.txt || true
while IFS= read -r f; do
  if [[ "$f" == */node/bin/node ]]; then
    codesign --force --options runtime --timestamp --entitlements "$ENT" --sign "$ID" "$f" >/dev/null 2>&1
  else
    codesign --force --options runtime --timestamp --sign "$ID" "$f" >/dev/null 2>&1
  fi
done < /tmp/macho-list.txt
codesign --force --options runtime --timestamp --sign "$ID" "$APP"
codesign --verify --deep --strict "$APP" >/dev/null 2>&1 && echo "    签名验证 OK"

echo "==> 2/7 公证"
rm -f /tmp/dsh-build/DSH装备版-notary.zip
ditto -c -k --keepParent "$APP" /tmp/dsh-build/DSH装备版-notary.zip
xcrun notarytool submit /tmp/dsh-build/DSH装备版-notary.zip --keychain-profile "$PROFILE" --wait | tail -2
xcrun stapler staple "$APP" >/dev/null 2>&1
xcrun stapler validate "$APP" | tail -1

echo "==> 3/7 产 Sparkle zip 更新包"
rm -rf "$RELEASE_DIR" && mkdir -p "$RELEASE_DIR"
ditto -c -k --keepParent "$APP" "$RELEASE_DIR/DSH-Upgrade-Kit-$VERSION.zip"
echo "    zip: DSH-Upgrade-Kit-$VERSION.zip ($(du -h "$RELEASE_DIR/DSH-Upgrade-Kit-$VERSION.zip" | cut -f1))"

echo "==> 4/7 生成 appcast（EdDSA 签名，私钥取钥匙串）"
# generate_appcast 需 Sparkle 工具；找不到时提示安装
if [ ! -x "$SPARKLE_BIN/generate_appcast" ]; then
  echo "    下载 Sparkle 工具…"
  mkdir -p /tmp/sparkle
  curl -sL -o /tmp/sparkle.tar.xz "https://github.com/sparkle-project/Sparkle/releases/download/2.9.6/Sparkle-2.9.6.tar.xz"
  tar -xJf /tmp/sparkle.tar.xz -C /tmp/sparkle --strip-components=0
fi
(cd "$RELEASE_DIR" && "$SPARKLE_BIN/generate_appcast" --download-url-prefix "https://github.com/piggy00544/dsh-upgrade-kit/releases/download/v$VERSION/" . 2>&1 | tail -3)
ls -la "$RELEASE_DIR/$FEED_NAME"

echo "==> 5/7 打 DMG"
rm -rf /tmp/dsh-build/staging && mkdir -p /tmp/dsh-build/staging
cp -R "$APP" /tmp/dsh-build/staging/
ln -s /Applications /tmp/dsh-build/staging/Applications
printf '把「DSH 装备版」拖进 Applications，双击即用（已通过 Apple 公证）。\n' > /tmp/dsh-build/staging/安装说明.txt
DMG="/tmp/dsh-build/DSH-Upgrade-Kit-$VERSION.dmg"
rm -f "$DMG"
hdiutil create -volname "DSH 装备版" -srcfolder /tmp/dsh-build/staging -ov -format UDZO "$DMG" >/dev/null 2>&1
echo "    DMG: $DMG"

echo "==> 6/7 发布 GitHub Release"
cd "$HERE/.."
gh release create "v$VERSION" \
  --title "DSH 装备版 v$VERSION" \
  --notes-file macos/RELEASE-NOTES.md \
  "$DMG" \
  "$RELEASE_DIR/DSH-Upgrade-Kit-$VERSION.zip" \
  "$RELEASE_DIR/$FEED_NAME" 2>&1 | tail -2

echo "==> 7/7 桌面副本"
cp "$DMG" "$HOME/Desktop/DSH 装备版 v$VERSION（公证版）.dmg"
echo "===== 发布完成 ====="
echo "用户更新通道: https://github.com/piggy00544/dsh-upgrade-kit/releases/latest/download/appcast.xml"
