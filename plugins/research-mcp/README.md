# dsh-research-mcp — 外网搜集 MCP Server

给 DeepSeek Harness（DSH）接入国际信息搜集能力的 MCP server：多引擎搜索 + 全文抓取 + 站点经验，**零 API key、零注册**，装完即用。

## 能力

注册后，模型侧会多出三个工具：

| 工具 | 做什么 |
|---|---|
| `mcp__research__search` | 国际多引擎检索：DuckDuckGo（通用）、Hacker News（AI 前沿讨论）、arXiv（论文）、GitHub（按 star 排序仓库）、Bing（可选）。**零 API key**，自动重试 |
| `mcp__research__fetch` | 抓取网页全文并抽取正文（静态层），适合博客、官方公告、文档、新闻页 |
| `mcp__research__site_hint` | 读取共享库中某站点的爬取经验（有效模式、反爬陷阱、登录态要求），抓陌生站点前先查，少走弯路 |

> 仓库自带 `site-patterns/` 种子（x.com、youtube、bilibili、公众号等 10 个常见站点）；也可以通过环境变量 `RESEARCH_SITE_PATTERNS`（多个目录用 `:` 分隔）指向自己的经验库。欢迎 PR 补充站点经验。

## 设计

- **单文件 server.mjs**，依赖仅 3 个（`@modelcontextprotocol/sdk`、`undici`、`zod`）
- 走 stdio 传输，由 DSH 官方 MCP 客户端（`@deepseek-ai/dsh-mcp-client`）加载
- 支持 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量（国内网络访问国际站点时由本机代理接管，不代理的站点自动直连）
- `failOnStartupError: false`：即使启动失败也不影响 DSH 正常对话

## 手动安装（DSH）

1. 安装依赖：

   ```bash
   cd plugins/research-mcp && npm install --omit=dev
   ```

2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 末尾追加：

   ```yaml
   - insert:
       - id: mcp-research
         name: '@deepseek-ai/dsh-mcp-client'
         config:
           serverName: research
           transport: stdio
           command: !!js process.execPath
           args:
             - '/绝对路径/plugins/research-mcp/server.mjs'
           env:
             HTTP_PROXY: 'http://127.0.0.1:7890'   # 按需改成你的代理，直连可整段删除
             HTTPS_PROXY: 'http://127.0.0.1:7890'
             NO_PROXY: 'localhost,127.0.0.1'
           toolCallTimeoutMs: 90000
           failOnStartupError: false
   ```

3. 重启 web：`launchctl kickstart -k gui/$(id -u)/com.deepseek.dsh-web`（或重启 dsh web）

> 更省事：用整合包根目录的 `install.sh` 一键装全部四个工具，本步骤自动完成。

## 测试

```bash
node test.mjs          # 打 smoke：search / fetch / site_hint 各一发
```

## 协议与许可

MCP stdio 协议（JSON-RPC 2.0）。MIT License。
