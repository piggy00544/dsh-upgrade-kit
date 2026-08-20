# dsh-cost — 用量与费用面板

DSH web profile 本地插件：侧栏底部 ¥ 按钮 → 仪表盘。

## 内容
- DeepSeek 账户真实余额（官方 `/user/balance` 接口，60s 缓存，可手动刷新）
- 今日 / 累计花费（按官方牌价估算，人民币为主 + 美元副显）
- token 用量（输入未命中 / 缓存命中 / 输出，按模型与按日拆分）
- 峰谷拆分与按小时分布（北京时间 9:00–12:00、14:00–18:00 为高峰，橙色）
- 会话明细（按花费排序，前 12 条）

## 结构
- `lib/index.js` — host 半边：扫描 `$DSH_HOME/sessions/*/*/session.jsonl.zstd` 建台账、
  挂 `/api/dsh-cost/{summary,balance,balance/refresh,prices}` 路由、余额代理。
  零依赖，纯 Node 内置模块。
- `lib/client.js` — 浏览器半边：`sidebar.footer.action` 槽位注册 ¥ 入口 + portal 面板。
  依赖静态模块表（react / react-dom），不 require 其他 fetch bundle。
- 装载：`$DSH_HOME/profiles/web/cordis.patch.yml` 中的 `dsh-cost` 行；
  pnpm 软链由 `dsh plugin --profile web add link:<本目录>` 建立。

## 改价格
价格表在 `lib/index.js` 的 `SCHEDULE`（元/百万 token，生效区间按北京时间）。
DeepSeek 调价时改这里 + 重启 web（`launchctl kickstart -k gui/$(id -u)/com.deepseek.dsh-web`）。

## 已知边界
- 金额是公开牌价估算；真实扣费以 platform.deepseek.com 账单为准（面板里两者并排，可对账）。
- 官方文档未注明周末是否豁免高峰时段，当前按"每日 9-12、14-18 为高峰"计。
- 8/17 之前的 V4-Flash 价格未公开，对应调用只计 token 不计金额。
- 台账按日志文件 (大小, mtime) 增量解析；请求进来时懒扫描，无后台轮询。
