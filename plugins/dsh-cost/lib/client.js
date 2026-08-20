/**
 * dsh-cost — browser half:
 * 侧栏底部常驻"用量状态条"（实时自动刷新，无需点击）+ 点击打开详情面板。
 * 模块格式：window.__ModuleLoader__.load({id, factory(require)})。
 */
window.__ModuleLoader__.load({
  id: "dsh-cost",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");
    var jsxRuntime = require("react/jsx-runtime");
    var reactDom = require("react-dom");
    var jsx = jsxRuntime.jsx;
    var jsxs = jsxRuntime.jsxs;
    var Fragment = jsxRuntime.Fragment;
    var useState = react.useState;
    var useEffect = react.useEffect;
    var useCallback = react.useCallback;
    var createPortal = reactDom.createPortal;
    var Component = react.Component;

    // -- styles -----------------------------------------------------------
    var css = [
      ".dc-entry{display:flex;flex-direction:column;align-items:center;gap:2px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:4px 6px;border-radius:8px}",
      ".dc-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dc-entry-icon{font-weight:700;font-size:15px;line-height:1}",
      ".dc-entry-mini{font-size:9px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}",
      ".dc-strip{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-module-platform,#f7f8fa));border-radius:12px;padding:8px 10px;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left}",
      ".dc-strip:hover{border-color:var(--dsw-alias-border-l1)}",
      ".dc-strip-row{display:flex;justify-content:space-between;align-items:baseline;padding:1px 0;font-variant-numeric:tabular-nums}",
      ".dc-strip-row .k{font-size:11px;color:var(--dsw-alias-label-secondary)}",
      ".dc-strip-row .v{font-size:12px;font-weight:600}",
      ".dc-strip-row .v .usd{font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-left:4px}",
      ".dc-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:dc-fade .15s ease}",
      "@keyframes dc-fade{from{opacity:0}}",
      ".dc-panel{width:min(760px,92vw);max-height:86vh;overflow-y:auto;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.25);color:var(--dsw-alias-label-primary);font-size:14px;padding:20px 22px;box-sizing:border-box}",
      ".dc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}",
      ".dc-title{font-size:17px;font-weight:700}",
      ".dc-sub{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:2px}",
      ".dc-close{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;cursor:pointer;width:28px;height:28px;border-radius:50%}",
      ".dc-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dc-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}",
      ".dc-card{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-module-platform,#f7f8fa));border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px}",
      ".dc-card.wide{grid-column:1/-1}",
      ".dc-card-title{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between}",
      ".dc-big{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}",
      ".dc-big .usd{font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-left:8px}",
      ".dc-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-variant-numeric:tabular-nums}",
      ".dc-row .k{color:var(--dsw-alias-label-secondary);font-size:13px}",
      ".dc-row .v{font-weight:600;font-size:13px}",
      ".dc-tag{display:inline-block;padding:1px 7px;border-radius:99px;font-size:11px;border:1px solid var(--dsw-alias-border-l2)}",
      ".dc-tag.peak{color:var(--dsw-alias-state-warn-primary,#b45309);border-color:currentColor}",
      ".dc-tag.off{color:var(--dsw-alias-state-success-primary,#15803d);border-color:currentColor}",
      ".dc-hbars{display:flex;align-items:flex-end;gap:3px;height:72px;padding-top:6px}",
      ".dc-hbar{flex:1;min-width:0;border-radius:2px 2px 0 0;background:var(--dsw-alias-state-success-primary,#16a34a);opacity:.85;position:relative}",
      ".dc-hbar.peak{background:var(--dsw-alias-state-warn-primary,#ea9a1f)}",
      ".dc-hbar.zero{height:2px;opacity:.25}",
      ".dc-hbar-label{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--dsw-alias-label-secondary)}",
      ".dc-haxis{display:flex;gap:3px;margin-top:2px}",
      ".dc-haxis span{flex:1;text-align:center;font-size:9px;color:var(--dsw-alias-label-secondary)}",
      ".dc-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}",
      ".dc-table th{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:500;text-align:left;padding:3px 6px;border-bottom:1px solid var(--dsw-alias-border-l2)}",
      ".dc-table td{font-size:13px;padding:5px 6px;border-bottom:1px solid var(--dsw-alias-border-l2)}",
      ".dc-table td.num,.dc-table th.num{text-align:right}",
      ".dc-note{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:12px;line-height:1.6}",
      ".dc-refresh{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-secondary);border-radius:8px;font-size:11px;padding:2px 8px;cursor:pointer}",
      ".dc-refresh:hover{color:var(--dsw-alias-label-primary)}",
      ".dc-err{color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px;margin-top:6px}",
      ".dc-loading{color:var(--dsw-alias-label-secondary);font-size:13px;padding:20px;text-align:center}"
    ].join("\n");
    var cssTagId = "dsh-cost/panel.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-cost";
      tag.dataset.pluginCss = cssTagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // -- formatters --------------------------------------------------------
    function fmtMoney(rmb) {
      if (rmb == null) return "—";
      if (rmb >= 1000) return "¥" + rmb.toFixed(0);
      return "¥" + rmb.toFixed(2);
    }
    function fmtUsd(usd) {
      if (usd == null) return "";
      return "$" + usd.toFixed(2);
    }
    function fmtTokens(n) {
      if (n == null) return "—";
      if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
      return String(n);
    }
    function fmtTime(ms) {
      return new Date(ms).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    function todayKey() {
      return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    }
    function dateKeyToDisplay(d) {
      if (d === todayKey()) return "今天";
      return d.slice(5).replace("-", "/");
    }
    function balanceCny(balance) {
      if (!balance || balance.error || !balance.balance_infos) return null;
      return balance.balance_infos.find(function (b) { return b.currency === "CNY"; }) || balance.balance_infos[0];
    }

    // -- helpers -------------------------------------------------------------
    function Card(props) {
      return jsx("div", { className: "dc-card" + (props.wide ? " wide" : ""), children: [
        jsx("div", { className: "dc-card-title", children: props.title }),
        props.children
      ] });
    }
    function KRow(props) {
      return jsx("div", { className: "dc-row", children: [
        jsx("span", { className: "k", children: props.k }),
        jsx("span", { className: "v", children: props.children })
      ] });
    }
    // 面板渲染错误就地兜底，绝不拖垮整个应用
    var ErrorBoundaryClass = class extends Component {
      constructor(props) {
        super(props);
        this.state = { err: null };
      }
      static getDerivedStateFromError(e) {
        return { err: e };
      }
      render() {
        if (this.state.err) {
          return jsx("div", { className: "dc-err", children: "面板渲染出错：" + String((this.state.err && this.state.err.message) || this.state.err) });
        }
        return this.props.children;
      }
    };

    // -- 详情面板（纯展示：数据由入口组件传入） --------------------------------
    function CostPanel(props) {
      var open = props.open;
      var onClose = props.onClose;
      var s = props.summary;
      var b = props.balance;
      var onRefresh = props.onRefresh;
      if (!open) return null;
      var balData = b && b.data;
      var cny = balanceCny(balData);
      var today = null;
      if (s && s.days && s.days.length) {
        today = s.days.find(function (d) { return d.date === todayKey(); }) || null;
      }
      var todayRow = today || (s && s.totals);
      var maxHourRmb = 1;
      if (s && s.hours) for (var i = 0; i < s.hours.length; i++) if (s.hours[i].rmb > maxHourRmb) maxHourRmb = s.hours[i].rmb;

      var body = !s
        ? jsx("div", { className: "dc-loading", children: "数据加载中…" })
        : jsxs(Fragment, { children: [
            jsxs("div", { className: "dc-cards", children: [
              jsx(Card, { title: jsxs("span", { children: [
                "DeepSeek 账户余额",
                balData && balData.error ? jsx("span", { className: "dc-tag", children: "读取失败" }) : null
              ] }), children: [
                cny
                  ? jsxs(Fragment, { children: [
                      jsx("div", { className: "dc-big", children: jsxs(Fragment, { children: [
                        "¥" + Number(cny.total_balance).toFixed(2),
                        jsx("span", { className: "usd", children: cny.currency === "CNY" ? "CNY" : cny.currency })
                      ] }) }),
                      jsx("div", { className: "dc-sub", children: "充值余额 ¥" + Number(cny.topped_up_balance).toFixed(2) + " · 赠送 ¥" + Number(cny.granted_balance).toFixed(2) })
                    ] })
                  : jsx("div", { className: "dc-big", children: "—" }),
                jsx("div", { className: "dc-card-title", style: { marginTop: 8, marginBottom: 0 }, children: jsxs(Fragment, { children: [
                  b && b.at ? "更新于 " + fmtTime(b.at) : "未读取",
                  jsx("button", { className: "dc-refresh", onClick: onRefresh, children: "刷新" })
                ] }) })
              ] }),
              jsx(Card, { title: today ? "今日花费（估算）" : "累计花费（估算）", children: [
                jsxs("div", { className: "dc-big", children: [
                  fmtMoney(todayRow.rmb),
                  jsx("span", { className: "usd", children: fmtUsd(todayRow.usd) })
                ] }),
                jsx("div", { className: "dc-sub", children: "按官方牌价估算 · 实际以控制台账单为准" })
              ] })
            ] }),

            jsx(Card, { wide: true, title: "累计总览（全部会话）", children: [
              jsx(KRow, { k: "估算金额", children: jsxs(Fragment, { children: [fmtMoney(s.totals.rmb), jsx("span", { className: "usd", children: fmtUsd(s.totals.usd) }) ] }) }),
              jsx(KRow, { k: "token 用量", children: "输入未命中 " + fmtTokens(s.totals.tokens.in) + " · 缓存命中 " + fmtTokens(s.totals.tokens.cr) + " · 输出 " + fmtTokens(s.totals.tokens.out) }),
              jsx(KRow, { k: "峰谷拆分", children: jsxs(Fragment, { children: [
                jsx("span", { className: "dc-tag peak", children: "高峰 ¥" + s.peakSplit.peakRmb.toFixed(2) }),
                " ",
                jsx("span", { className: "dc-tag off", children: "低峰 ¥" + s.peakSplit.offRmb.toFixed(2) })
              ] }) }),
              jsx(KRow, { k: "计费调用数", children: String(s.totals.calls) + " 次" + (s.totals.unpricedCalls ? "（" + s.totals.unpricedCalls + " 次无公开价格未计）" : "") })
            ] }),

            jsxs("div", { className: "dc-cards", children: [
              jsx(Card, { title: "按模型", children: jsxs("table", { className: "dc-table", children: [
                jsxs("tbody", { children: s.byModel.map(function (m) {
                  return jsxs("tr", { key: m.model, children: [
                    jsx("td", { children: m.model }),
                    jsx("td", { className: "num", children: fmtTokens(m.tokens.in + m.tokens.out) }),
                    jsx("td", { className: "num", children: jsxs(Fragment, { children: [fmtMoney(m.rmb), " ", jsx("span", { className: "usd", children: fmtUsd(m.usd) })] }) })
                  ] });
                }) })
              ] }) }),
              jsx(Card, { title: "按日（近 7 天）", children: jsxs("table", { className: "dc-table", children: [
                jsxs("tbody", { children: s.days.slice(0, 7).map(function (d) {
                  return jsxs("tr", { key: d.date, children: [
                    jsx("td", { children: dateKeyToDisplay(d.date) }),
                    jsx("td", { className: "num", children: fmtTokens(d.tokens.in + d.tokens.out) }),
                    jsx("td", { className: "num", children: jsxs(Fragment, { children: [fmtMoney(d.rmb), " ", jsx("span", { className: "usd", children: fmtUsd(d.usd) })] }) })
                  ] });
                }) })
              ] }) })
            ] }),

            jsx(Card, { wide: true, title: "花费按小时分布（北京时间 · 橙色为高峰时段）", children: [
              jsxs("div", { className: "dc-hbars", children: s.hours.map(function (hh) {
                var h = Math.round((hh.rmb / maxHourRmb) * 56);
                return jsx("div", {
                  key: hh.h,
                  className: "dc-hbar" + (hh.peak ? " peak" : "") + (hh.rmb === 0 ? " zero" : ""),
                  style: { height: Math.max(hh.rmb > 0 ? h : 1, 1) + "px" },
                  title: hh.h + ":00 · ¥" + hh.rmb.toFixed(2) + " · " + fmtTokens(hh.tokens) + " 输出 tokens",
                  children: hh.rmb > 0 && hh.h % 2 === 0 ? jsx("span", { className: "dc-hbar-label", children: hh.h }) : null
                });
              }) }),
              jsxs("div", { className: "dc-haxis", children: [0, 6, 12, 18, 23].map(function (h) { return jsx("span", { key: h, children: h + "时" }); }) })
            ] }),

            jsx(Card, { wide: true, title: "会话明细（按花费排序）", children: jsxs("table", { className: "dc-table", children: [
              jsxs("tbody", { children: s.sessions.filter(function (x) { return x.rmb > 0; }).slice(0, 12).map(function (x) {
                return jsxs("tr", { key: x.id, children: [
                  jsx("td", { children: jsxs(Fragment, { children: [x.title || "（无标题）", jsx("div", { className: "dc-sub", children: x.cwd || "" })] }) }),
                  jsx("td", { className: "num", children: x.calls + " 次" }),
                  jsx("td", { className: "num", children: fmtTokens(x.tokens.in + x.tokens.out) }),
                  jsx("td", { className: "num", children: jsxs(Fragment, { children: [fmtMoney(x.rmb), " ", jsx("span", { className: "usd", children: fmtUsd(x.usd) })] }) })
                ] });
              }) })
            ] }) }),

            jsx("div", { className: "dc-note", children: "说明：token 用量来自每次调用的提供方回报，与计费同源；金额按 DeepSeek 官方公开牌价（8/12 初始价 → 8/17 峰谷价）估算，人民币为主。真实扣费与赠送额度以 platform.deepseek.com 账单为准。高峰时段：北京时间 9:00–12:00、14:00–18:00。" })
          ] });

      var panel = jsxs("div", { className: "dc-backdrop", onClick: onClose, children:
        jsx("div", { className: "dc-panel", onClick: function (e) { e.stopPropagation(); }, children: [
          jsxs("div", { className: "dc-head", children: [
            jsxs("div", { children: [
              jsx("div", { className: "dc-title", children: "用量与费用" }),
              jsx("div", { className: "dc-sub", children: "token 消耗 · 峰谷计价估算 · DeepSeek 余额" })
            ] }),
            jsx("button", { className: "dc-close", onClick: onClose, title: "关闭", children: "×" })
          ] }),
          jsx(ErrorBoundaryClass, { children: body })
        ] })
      });

      if (typeof document !== "undefined") return createPortal(panel, document.body);
      return panel;
    }

    // -- 侧栏常驻入口：状态条（宽） / ¥ 图标（窄），点击开面板 -----------------
    function CostEntry(props) {
      var open = useState(false);
      var sState = useState(null);
      var bState = useState(null);
      var load = useCallback(function () {
        fetch("/api/dsh-cost/summary")
          .then(function (r) { return r.json(); })
          .then(function (j) { sState[1](j); })
          .catch(function () {});
        fetch("/api/dsh-cost/balance")
          .then(function (r) { return r.json(); })
          .then(function (j) { bState[1](j.balance); })
          .catch(function () {});
      }, []);
      var refresh = useCallback(function () {
        fetch("/api/dsh-cost/balance/refresh")
          .then(function (r) { return r.json(); })
          .then(function (j) { bState[1](j.balance); })
          .catch(function () {});
      }, []);
      useEffect(function () {
        load();
        var t = setInterval(load, 10000);
        return function () { clearInterval(t); };
      }, []);

      var s = sState[0];
      var b = bState[0];
      var balData = b && b.data;
      var cny = balanceCny(balData);
      var today = null;
      if (s && s.days && s.days.length) {
        today = s.days.find(function (d) { return d.date === todayKey(); }) || null;
      }
      var todayRow = today || (s && s.totals);
      var todayRmb = todayRow ? todayRow.rmb : null;
      var todayUsd = todayRow ? todayRow.usd : null;
      var todayTokens = todayRow ? (todayRow.tokens.in + todayRow.tokens.out) : null;
      var balanceRmb = cny ? Number(cny.total_balance) : null;

      return jsxs(Fragment, { children: [
        props.wide
          ? jsx("button", {
              className: "dc-strip",
              title: "用量与费用 · 点击查看详情",
              onClick: function () { open[1](true); },
              children: jsxs(Fragment, { children: [
                jsxs("div", { className: "dc-strip-row", children: [
                  jsx("span", { className: "k", children: "今日花费" }),
                  jsx("span", { className: "v", children: jsxs(Fragment, { children: [
                    todayRmb == null ? "…" : fmtMoney(todayRmb),
                    todayUsd == null ? null : jsx("span", { className: "usd", children: fmtUsd(todayUsd) })
                  ] }) })
                ] }),
                jsxs("div", { className: "dc-strip-row", children: [
                  jsx("span", { className: "k", children: "账户余额" }),
                  jsx("span", { className: "v", children: balanceRmb == null ? "…" : "¥" + balanceRmb.toFixed(2) })
                ] }),
                jsxs("div", { className: "dc-strip-row", children: [
                  jsx("span", { className: "k", children: "今日 token" }),
                  jsx("span", { className: "v", children: todayTokens == null ? "…" : fmtTokens(todayTokens) })
                ] })
              ] })
            })
          : jsx("button", {
              className: "dc-entry",
              title: "今日 " + (todayRmb == null ? "…" : fmtMoney(todayRmb)) + " · 余额 " + (balanceRmb == null ? "…" : "¥" + balanceRmb.toFixed(2)) + " · 点击看详情",
              onClick: function () { open[1](true); },
              children: jsxs(Fragment, { children: [
                jsx("span", { className: "dc-entry-icon", children: "¥" }),
                jsx("span", { className: "dc-entry-mini", children: todayRmb == null ? "…" : String(Math.round(todayRmb)) })
              ] })
            }),
        jsx(CostPanel, { open: open[0], onClose: function () { open[1](false); }, summary: s, balance: b, onRefresh: refresh })
      ] });
    }

    // -- 插件入口 ------------------------------------------------------------
    var inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("sidebar.footer.action", function () {
        return ctx.slots.register({ name: "sidebar.footer.action", id: "dsh-cost" }, CostEntry);
      });
    }
    exports.apply = apply;
    exports.inject = inject;
    exports._test = { CostEntry: CostEntry, CostPanel: CostPanel };
    return module.exports;
  }
});
