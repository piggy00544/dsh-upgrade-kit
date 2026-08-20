window.__ModuleLoader__.load({
	id: "dsh-plugin-file-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_client = require("@deepseek-ai/dsh-client-runtime/client"), import_client2 = require("@deepseek-ai/dsh-client-locale/client"), import_client3 = require("@deepseek-ai/dsh-client-ui-layout/client"), import_client4 = require("@deepseek-ai/dsh-client-ui-conversation/client"), import_client5 = require("@deepseek-ai/dsh-client-ui-deliverables/client"), import_react = require("react"), import_jsx_runtime = require("react/jsx-runtime"), NS = "dsh-file-preview", zh = {
  button: "\u9644\u4EF6",
  panelTitle: "\u4F1A\u8BDD\u9644\u4EF6",
  dropHint: "\u628A\u6587\u4EF6\u62D6\u8FDB\u8FD9\u91CC\uFF0C\u5373\u4F20\u5373\u770B",
  empty: "\u8FD8\u6CA1\u6709\u6587\u4EF6\uFF0C\u62D6\u4E00\u4E2A\u8FDB\u6765\u8BD5\u8BD5",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  uploadFailed: "\u4E0A\u4F20\u5931\u8D25",
  close: "\u5173\u95ED",
  download: "\u4E0B\u8F7D",
  delete: "\u5220\u9664",
  retry: "\u91CD\u8BD5",
  textTruncated: "\uFF08\u6587\u672C\u8FC7\u957F\uFF0C\u5DF2\u622A\u65AD\u9884\u89C8\uFF09",
  previewUnsupported: "\u8BE5\u7C7B\u578B\u6682\u4E0D\u652F\u6301\u9884\u89C8",
  uploading: "\u4E0A\u4F20\u4E2D",
  producedLabel: "\u4EA7\u51FA\u6587\u4EF6",
  preview: "\u9884\u89C8",
  openLocal: "\u6253\u5F00"
}, en = {
  button: "Attachments",
  panelTitle: "Session attachments",
  dropHint: "Drop files here to upload and preview",
  empty: "No files yet \u2014 drop one in",
  loading: "Loading\u2026",
  loadFailed: "Failed to load",
  uploadFailed: "Upload failed",
  close: "Close",
  download: "Download",
  delete: "Delete",
  retry: "Retry",
  textTruncated: "(text truncated for preview)",
  previewUnsupported: "Preview not supported for this type",
  uploading: "Uploading",
  producedLabel: "Produced files",
  preview: "Preview",
  openLocal: "Open"
};
async function apiJson(url, init) {
  let response = await fetch(url, init);
  if (!response.ok) throw new Error(`http ${response.status}`);
  return await response.json();
}
var API = {
  list: (sessionId) => apiJson(
    `/dsh-plugin-file-preview/list?sessionId=${encodeURIComponent(sessionId)}`
  ),
  upload: (file, sessionId) => apiJson(
    `/dsh-plugin-file-preview/files?name=${encodeURIComponent(file.name)}&mediaType=${encodeURIComponent(
      file.type || "application/octet-stream"
    )}&sessionId=${encodeURIComponent(sessionId)}`,
    { method: "PUT", body: file }
  ),
  remove: (id) => apiJson(`/dsh-plugin-file-preview/files/${id}`, { method: "DELETE" }),
  url: (id) => `/dsh-plugin-file-preview/files/${id}`,
  ws: (path, kind) => `/dsh-plugin-file-preview/ws?path=${encodeURIComponent(path)}&kind=${kind}`
};
function wsPreviewMode(name) {
  let ext = name.toLowerCase().split(".").pop() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? "image" : ext === "pdf" ? "pdf" : ["md", "markdown", "txt", "log", "json", "jsonl", "csv", "tsv", "html", "css", "js", "mjs", "ts", "tsx", "py", "sh", "yaml", "yml", "toml", "xml"].includes(
    ext
  ) ? "text" : "big";
}
function baseName(path) {
  let parts = path.split("/");
  return parts[parts.length - 1] || path;
}
var CLOSED = {
  open: !1,
  sessionId: null,
  files: [],
  selectedId: null,
  uploading: !1,
  listError: !1,
  version: 0,
  ws: null
};
function createPanelStore() {
  let state = CLOSED, listeners = /* @__PURE__ */ new Set(), emit = () => {
    for (let listener of listeners) listener();
  }, set = (patch) => {
    state = { ...state, ...patch }, emit();
  }, refresh = () => {
    let sessionId = state.sessionId;
    sessionId && API.list(sessionId).then((result) => {
      if (!state.open || state.sessionId !== sessionId) return;
      let files = result.files ?? [];
      set({
        files,
        listError: !1,
        version: state.version + 1,
        selectedId: state.selectedId && files.some((f) => f.id === state.selectedId) ? state.selectedId : files[0]?.id ?? null
      });
    }).catch(() => {
      state.open && set({ listError: !0 });
    });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    open: (sessionId) => {
      if (state.open && state.sessionId === sessionId && state.ws === null) {
        refresh();
        return;
      }
      state = { ...CLOSED, open: !0, sessionId }, emit(), refresh();
    },
    openWorkspace: (ws) => {
      state = { ...CLOSED, open: !0, ws }, emit();
    },
    close: () => {
      state.open && (state = { ...CLOSED }, emit());
    },
    select: (id) => {
      state.open && id !== state.selectedId && set({ selectedId: id });
    },
    refresh,
    upload: async (fileList) => {
      let sessionId = state.sessionId;
      if (!sessionId || state.uploading) return;
      let files = Array.from(fileList);
      if (files.length !== 0) {
        set({ uploading: !0 });
        try {
          for (let file of files) {
            let result = await API.upload(file, sessionId);
            if (!state.open) return;
            result.ok && result.file && (set({
              files: [result.file, ...state.files.filter((f) => f.id !== result.file.id)],
              version: state.version + 1
            }), state = { ...state, selectedId: result.file.id }, emit());
          }
        } catch {
          state.open && set({ listError: !0 });
        } finally {
          state.open && set({ uploading: !1 });
        }
      }
    },
    remove: async (id) => {
      state.open && (await API.remove(id), set({
        files: state.files.filter((f) => f.id !== id),
        version: state.version + 1,
        selectedId: state.selectedId === id ? state.files.find((f) => f.id !== id)?.id ?? null : state.selectedId
      }));
    }
  };
}
var ui = {
  mask: {
    position: "fixed",
    inset: 0,
    zIndex: 1200,
    background: "var(--dsw-alias-bg-mask-1, rgba(0,0,0,.45))",
    backdropFilter: "blur(var(--dsw-mask-blur, 4px))",
    pointerEvents: "auto"
  },
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 1201,
    width: "min(560px, 92vw)",
    display: "flex",
    flexDirection: "column",
    background: "var(--dsw-specific-input-major, #fff)",
    borderLeft: "1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(0,0,0,.08))",
    boxShadow: "var(--dsw-shadow-lv2, 0 8px 30px rgba(0,0,0,.18))",
    fontFamily: "var(--dsw-font-family, system-ui)",
    color: "var(--dsw-alias-label-primary, #1a1a1a)",
    pointerEvents: "auto"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(0,0,0,.08))",
    fontSize: 15,
    fontWeight: 600
  },
  headerTitle: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: "none",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))",
    color: "var(--dsw-alias-label-secondary, #555)",
    cursor: "pointer",
    fontSize: 13
  },
  closeButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--dsw-alias-label-secondary, #555)",
    cursor: "pointer"
  },
  dropHint: {
    margin: 12,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px dashed var(--dsw-alias-border-l2, rgba(0,0,0,.18))",
    color: "var(--dsw-alias-label-caption, #999)",
    fontSize: 12,
    textAlign: "center"
  },
  list: { flex: "0 0 auto", overflowY: "auto", maxHeight: 220, borderBottom: "1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(0,0,0,.08))" },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 16px",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13
  },
  listItemActive: { background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))" },
  fileName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fileMeta: { flex: "0 0 auto", color: "var(--dsw-alias-label-caption, #999)", fontSize: 11 },
  body: { flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", justifyContent: "center", overflow: "auto", padding: 16 },
  center: { margin: "auto", textAlign: "center", color: "var(--dsw-alias-label-secondary, #555)", fontSize: 13 },
  previewImage: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 },
  previewFrame: { width: "100%", height: "100%", border: "none", borderRadius: 8 },
  previewText: {
    width: "100%",
    margin: 0,
    padding: 16,
    overflow: "auto",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04))",
    borderRadius: 8,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  action: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12))",
    background: "transparent",
    color: "var(--dsw-alias-label-primary, #1a1a1a)",
    cursor: "pointer",
    fontSize: 13
  }
};
function bytesText(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
}
function timeText(time) {
  if (!time) return "";
  let d = new Date(time), pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fileIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 1.5h5.5L13 5v9.5H4V1.5Z", stroke: "currentColor", strokeWidth: "1.2", strokeLinejoin: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.5 1.5V5H13", stroke: "currentColor", strokeWidth: "1.2", strokeLinejoin: "round" })
  ] });
}
var TEXT_MEDIA = /* @__PURE__ */ new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-ndjson"
]), TEXT_LIMIT = 2e5;
function PreviewBody({ file, url, t }) {
  let mediaType = file.mediaType, [text, setText] = (0, import_react.useState)(null), [truncated, setTruncated] = (0, import_react.useState)(!1), [failed, setFailed] = (0, import_react.useState)(!1);
  return (0, import_react.useEffect)(() => {
    if (!TEXT_MEDIA.has(mediaType)) return;
    let cancelled = !1;
    return setText(null), setTruncated(!1), setFailed(!1), fetch(url).then((response) => response.text()).then((value) => {
      if (cancelled) return;
      let cut = value.length > TEXT_LIMIT;
      setText(cut ? value.slice(0, TEXT_LIMIT) : value), setTruncated(cut);
    }).catch(() => {
      cancelled || setFailed(!0);
    }), () => {
      cancelled = !0;
    };
  }, [url, mediaType]), mediaType.startsWith("image/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: url, alt: file.name, style: ui.previewImage }) : mediaType === "application/pdf" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", { title: file.name, src: url, style: ui.previewFrame }) : TEXT_MEDIA.has(mediaType) ? failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.center, children: t("loadFailed") }) : text === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.center, children: t("loading") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("pre", { style: ui.previewText, children: [
    text,
    truncated ? `
` + t("textTruncated") : ""
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ui.center, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginBottom: 12 }, children: t("previewUnsupported") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { href: url, download: file.name, style: ui.action, children: [
      t("download"),
      " (",
      bytesText(file.bytes),
      ")"
    ] })
  ] });
}
function AttachmentsButton({ sessionId, t, panel }) {
  let state = (0, import_react.useSyncExternalStore)(panel.subscribe, panel.getSnapshot), count = (0, import_react.useMemo)(
    () => state.sessionId === sessionId && state.open ? state.files.length : -1,
    [state.sessionId, state.open, state.version, state.files.length, sessionId]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", title: t("button"), style: ui.iconButton, onClick: () => panel.open(sessionId), children: [
    fileIcon(),
    t("button"),
    count > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-state-business-primary, #4d6bfe)", fontWeight: 600 }, children: count })
  ] });
}
function PreviewPanel({ t, panel }) {
  let state = (0, import_react.useSyncExternalStore)(panel.subscribe, panel.getSnapshot), [dragOver, setDragOver] = (0, import_react.useState)(!1);
  if ((0, import_react.useEffect)(() => {
    if (!state.open) return;
    let onKey = (event) => {
      event.key === "Escape" && panel.close();
    };
    return window.addEventListener("keydown", onKey), () => window.removeEventListener("keydown", onKey);
  }, [state.open, panel]), !state.open) return null;
  let selected = state.files.find((f) => f.id === state.selectedId) ?? null, ws = state.ws, onDrop = (event) => {
    event.preventDefault(), setDragOver(!1);
    let files = event.dataTransfer?.files;
    files && files.length > 0 && panel.upload(files);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.mask, onClick: () => panel.close() }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          ...ui.panel,
          outline: dragOver ? "2px dashed var(--dsw-alias-state-business-primary, #4d6bfe)" : "none",
          outlineOffset: -6
        },
        role: "dialog",
        "aria-label": t("panelTitle"),
        onDragOver: (event) => {
          event.preventDefault(), setDragOver(!0);
        },
        onDragLeave: () => setDragOver(!1),
        onDrop,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ui.header, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ui.headerTitle, children: ws ? ws.name : `${t("panelTitle")} \xB7 ${state.files.length}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", title: t("close"), style: ui.closeButton, onClick: () => panel.close(), children: "\u2715" })
          ] }),
          ws ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WsPreviewBody, { ws, t }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.dropHint, children: state.uploading ? `${t("uploading")}\u2026` : t("dropHint") }),
            state.listError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                style: {
                  margin: "0 16px 8px",
                  fontSize: 12,
                  color: "var(--dsw-alias-state-error-primary, #d86161)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 }, children: t("uploadFailed") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: ui.action, onClick: () => panel.refresh(), children: t("retry") })
                ]
              }
            ),
            state.files.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 24, textAlign: "center", color: "var(--dsw-alias-label-caption, #999)", fontSize: 13 }, children: t("empty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.list, children: state.files.map((file) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                style: file.id === state.selectedId ? { ...ui.listItem, ...ui.listItemActive } : ui.listItem,
                onClick: () => panel.select(file.id),
                children: [
                  fileIcon(),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ui.fileName, children: file.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: ui.fileMeta, children: timeText(file.time) })
                ]
              },
              file.id
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.body, children: selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewBody, { file: selected, url: API.url(selected.id), t }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.center, children: state.files.length === 0 ? "" : t("empty") }) }),
            selected && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 16px 12px",
                  fontSize: 11,
                  color: "var(--dsw-alias-label-caption, #999)"
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
                    selected.mediaType,
                    " \xB7 ",
                    bytesText(selected.bytes)
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: API.url(selected.id), download: selected.name, style: ui.action, children: t("download") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      type: "button",
                      style: ui.action,
                      onClick: () => {
                        panel.remove(selected.id);
                      },
                      children: t("delete")
                    }
                  )
                ]
              }
            )
          ] })
        ]
      }
    )
  ] });
}
function WsPreviewBody({ ws, t }) {
  let mode = wsPreviewMode(ws.name), [text, setText] = (0, import_react.useState)(null), [truncated, setTruncated] = (0, import_react.useState)(!1), [failed, setFailed] = (0, import_react.useState)(!1), rawUrl = API.ws(ws.path, "raw");
  (0, import_react.useEffect)(() => {
    if (mode !== "text") return;
    let cancelled = !1;
    return setText(null), setTruncated(!1), setFailed(!1), fetch(rawUrl).then((response) => response.text()).then((value) => {
      if (cancelled) return;
      let cut = value.length > TEXT_LIMIT;
      setText(cut ? value.slice(0, TEXT_LIMIT) : value), setTruncated(cut);
    }).catch(() => {
      cancelled || setFailed(!0);
    }), () => {
      cancelled = !0;
    };
  }, [rawUrl, mode]);
  let body = mode === "image" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: rawUrl, alt: ws.name, style: ui.previewImage }) : mode === "pdf" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", { title: ws.name, src: rawUrl, style: ui.previewFrame }) : mode === "text" ? failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.center, children: t("loadFailed") }) : text === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.center, children: t("loading") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("pre", { style: ui.previewText, children: [
    text,
    truncated ? `
` + t("textTruncated") : ""
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "img",
    {
      src: API.ws(ws.path, "big"),
      alt: ws.name,
      style: ui.previewImage,
      onError: (event) => {
        event.currentTarget.style.display = "none";
      }
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: ui.body, children: body }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px 12px",
          fontSize: 11,
          color: "var(--dsw-alias-label-caption, #999)"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ws.path }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: rawUrl, download: ws.name, style: ui.action, children: t("download") }),
          ws.openFile && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: ui.action, onClick: () => ws.openFile?.(), children: t("openLocal") })
        ]
      }
    )
  ] });
}
function selectProducedCards(owner) {
  let data = owner?.turn?.data?.get?.("deliverables");
  if (!data) return null;
  let paths = [], seen = /* @__PURE__ */ new Set();
  for (let produced of data.produced ?? [])
    produced.seq > (owner.seq ?? Number.POSITIVE_INFINITY) || seen.has(produced.path) || (seen.add(produced.path), paths.push(produced.path));
  return paths.length === 0 ? null : paths;
}
var uiCard = {
  root: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    padding: "4px 0 8px"
  },
  card: {
    width: 132,
    borderRadius: 10,
    border: "1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(0,0,0,.08))",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.03))",
    overflow: "hidden",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    color: "inherit",
    padding: 0,
    fontSize: 12,
    textAlign: "left"
  },
  thumb: {
    width: "100%",
    height: 88,
    objectFit: "cover",
    display: "block",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04))"
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 8px",
    minWidth: 0
  },
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
};
function TurnTailPreview({ openFile, matched, useSessions, sessionId, t, panel }) {
  let cwd = useSessions((s) => s)?.byId?.[sessionId]?.cwd, cards = (0, import_react.useMemo)(
    () => matched.map((path) => {
      let name = baseName(path), absolute = path.startsWith("/") ? path : cwd ? `${cwd.replace(/\/+$/, "")}/${path}` : path;
      return { path, name, absolute };
    }),
    [matched, cwd]
  );
  return cards.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: uiCard.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-caption, #999)", alignSelf: "center" }, children: t("producedLabel") }),
    cards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        title: `${card.path}
${t("preview")} \xB7 ${t("openLocal")}`,
        style: uiCard.card,
        onClick: () => panel.openWorkspace({ name: card.name, path: card.absolute, openFile: () => openFile(card.path) }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "img",
            {
              src: API.ws(card.absolute, "thumb"),
              alt: "",
              style: uiCard.thumb,
              loading: "lazy",
              onError: (event) => {
                event.currentTarget.style.display = "none";
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: uiCard.label, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: uiCard.name, children: card.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 3.5 10.5 8 6 12.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }) })
          ] })
        ]
      },
      card.path
    ))
  ] });
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, "zh", zh), "file-preview: zh dictionary"), ctx.effect(() => ctx.locale.register(NS, "en", en), "file-preview: en dictionary");
  let t = ctx.locale.bind(NS), panel = createPanelStore();
  ctx.slots.inject(
    "conversation.session.header.utilities",
    () => ctx.slots.register(
      {
        name: "conversation.session.header.utilities",
        id: "file-preview-attachments",
        order: 0,
        inject: () => ({
          t,
          panel
        })
      },
      AttachmentsButton
    )
  ), ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register(
      {
        name: "shell.overlay",
        id: "file-preview-panel",
        inject: () => ({
          t,
          panel
        })
      },
      PreviewPanel
    )
  ), ctx.slots.inject(
    "conversation.chat.turnTail",
    () => ctx.slots.register(
      {
        name: "conversation.chat.turnTail",
        id: "file-preview-turn-tail",
        priority: -1,
        select: selectProducedCards,
        inject: () => ({
          t,
          panel
        })
      },
      TurnTailPreview
    )
  );
}
		return module.exports;
	}
});
