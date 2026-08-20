#!/usr/bin/env bash
# notarize.sh — 给「DSH 装备版.app」做 Developer ID 签名 + Apple 公证 + 钉票据 + 打 DMG。
# 前置：build.sh 已产出 App；Developer ID 证书已装钥匙串；notarytool 凭据已存
#       （xcrun notarytool store-credentials "dsh-notary-profile" --apple-id ... --team-id ...）
# 用法：bash notarize.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="/tmp/dsh-build/DSH 装备版.app"
ZIP="/tmp/dsh-build/DSH装备版-notary.zip"
ID="${DEVELOPER_ID_NAME:-Developer ID Application: TECHBOOKS LTD (M953F4AZL8)}"
PROFILE="${NOTARY_PROFILE:-dsh-notary-profile}"
VERSION="${VERSION:-0.1.2}"

[ -d "$APP" ] || { echo "先跑 build.sh 产出 App"; exit 1; }

echo "==> 1/5 扫描全部 Mach-O 并逐个签名（runtime + timestamp）"
find "$APP" -type f > /tmp/all-files.txt
file -f /tmp/all-files.txt 2>/dev/null | grep "Mach-O" | cut -d: -f1 > /tmp/macho-list.txt
COUNT=0
while IFS= read -r f; do
  if [[ "$f" == */node/bin/node ]]; then
    # node 的 V8 需要 JIT entitlements（否则 macOS 以 SIGTRAP 拒绝启动）
    codesign --force --options runtime --timestamp --entitlements "$HERE/assets/node-entitlements.plist" --sign "$ID" "$f" >/dev/null 2>&1
  else
    codesign --force --options runtime --timestamp --sign "$ID" "$f" >/dev/null 2>&1
  fi
  COUNT=$((COUNT+1))
done < /tmp/macho-list.txt
echo "    已签名 $COUNT 个 Mach-O"

echo "==> 2/5 签主 App"
codesign --force --options runtime --timestamp --sign "$ID" "$APP"
codesign --verify --deep --strict "$APP" >/dev/null 2>&1 && echo "    深度验证 OK"

echo "==> 3/5 打包并提交公证"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait | tail -2

echo "==> 4/5 钉票据并验证"
xcrun stapler staple "$APP" >/dev/null 2>&1
xcrun stapler validate "$APP" | tail -1

echo "==> 5/5 打 DMG"
rm -rf /tmp/dsh-build/staging && mkdir -p /tmp/dsh-build/staging
cp -R "$APP" /tmp/dsh-build/staging/
ln -s /Applications /tmp/dsh-build/staging/Applications
printf '把「DSH 装备版」拖进 Applications，双击即用（已通过 Apple 公证）。\n' > /tmp/dsh-build/staging/安装说明.txt
DMG="/tmp/dsh-build/DSH-Upgrade-Kit-$VERSION.dmg"
rm -f "$DMG"
hdiutil create -volname "DSH 装备版" -srcfolder /tmp/dsh-build/staging -ov -format UDZO "$DMG" >/dev/null 2>&1
echo "DMG: $DMG"
shasum -a 256 "$DMG" | cut -c1-24
