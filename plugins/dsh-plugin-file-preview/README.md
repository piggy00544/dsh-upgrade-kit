# dsh-plugin-file-preview — 会话文件预览插件

给 DeepSeek Harness 的 Web UI 加上「文件在哪、长什么样」的直观体验：**产物卡片 + 附件面板 + 拖拽上传**，纯 UI 插件，不动会话数据。

## 功能

| 能力 | 说明 |
|---|---|
| 产物预览卡片 | 每个 assistant 回合尾部自动挂出本轮产生的文件（图片 / PDF / 文本 / 大文件），点卡片直接看内容，不用再去翻工作区目录 |
| 附件预览面板 | 会话头部出现「附件」按钮 → 右侧滑出面板：本会话附件列表 + 按类型预览（图片、文本、PDF、二进制信息） |
| 拖拽上传抽屉 | 把文件拖进聊天窗口即可上传到当前会话（按 session 隔离） |
| 智能预览 | 按扩展名路由预览模式：图片直显、PDF 内嵌、文本高亮、超限文件显示大小/哈希元信息 |

## 安装（DSH web profile）

```bash
cd /path/to/dsh-upgrade-kit
dsh plugin --profile web add link:$PWD/plugins/dsh-plugin-file-preview
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: file-preview
      name: 'dsh-plugin-file-preview'
```

重启 web：`launchctl kickstart -k gui/$(id -u)/com.deepseek.dsh-web`

> 更省事：用整合包根目录的 `install.sh` 一键装全部四个工具，本步骤自动完成。

## 结构

- `lib/index.js` — host 半边（空壳注册，纯 UI 插件）
- `lib/client.js` — 浏览器半边（已构建产物，开箱即用）
- `src/client.tsx` — 源码；`node build.mjs` 重新构建（需要 esbuild，脚本自动经 npx 拉取）

## 许可

MIT License
