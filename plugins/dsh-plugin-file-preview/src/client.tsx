/**
 * dsh-plugin-file-preview — browser half.
 *
 * Two slot entries over one apply-closure store:
 *  1. conversation.session.header.utilities (list, session scope)
 *     an "attachments" button with a live count; click opens the panel.
 *  2. shell.overlay (list, root scope)
 *     the right-side panel: drop-to-upload zone, per-session file list, and
 *     a per-mediaType preview served by this package's own HTTP routes.
 *
 * All imports are external module-table edges (react, @deepseek-ai/*); the
 * build (build.mjs) wraps the esbuild CJS output in __ModuleLoader__.load.
 */
import "@deepseek-ai/dsh-client-runtime/client";
import "@deepseek-ai/dsh-client-locale/client";
import "@deepseek-ai/dsh-client-ui-layout/client";
import "@deepseek-ai/dsh-client-ui-conversation/client";
import "@deepseek-ai/dsh-client-ui-deliverables/client";

import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from "react";

const NS = "dsh-file-preview";

/* ── dictionaries ─────────────────────────────────────────────────────── */

const zh = {
  button: "附件",
  panelTitle: "会话附件",
  dropHint: "把文件拖进这里，即传即看",
  empty: "还没有文件，拖一个进来试试",
  loading: "加载中…",
  loadFailed: "加载失败",
  uploadFailed: "上传失败",
  close: "关闭",
  download: "下载",
  delete: "删除",
  retry: "重试",
  textTruncated: "（文本过长，已截断预览）",
  previewUnsupported: "该类型暂不支持预览",
  uploading: "上传中",
  producedLabel: "产出文件",
  preview: "预览",
  openLocal: "打开",
} as const;

const en: Record<keyof typeof zh, string> = {
  button: "Attachments",
  panelTitle: "Session attachments",
  dropHint: "Drop files here to upload and preview",
  empty: "No files yet — drop one in",
  loading: "Loading…",
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
  openLocal: "Open",
};

/* ── host API (this package's own HTTP routes) ────────────────────────── */

export type PreviewFile = {
  id: string;
  name: string;
  mediaType: string;
  bytes: number;
  time: number;
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`http ${response.status}`);
  return (await response.json()) as T;
}

const API = {
  list: (sessionId: string) =>
    apiJson<{ ok: boolean; files: PreviewFile[] }>(
      `/dsh-plugin-file-preview/list?sessionId=${encodeURIComponent(sessionId)}`,
    ),
  upload: (file: File, sessionId: string) =>
    apiJson<{ ok: boolean; file: PreviewFile }>(
      `/dsh-plugin-file-preview/files?name=${encodeURIComponent(file.name)}&mediaType=${encodeURIComponent(
        file.type || "application/octet-stream",
      )}&sessionId=${encodeURIComponent(sessionId)}`,
      { method: "PUT", body: file },
    ),
  remove: (id: string) =>
    apiJson<{ ok: boolean }>(`/dsh-plugin-file-preview/files/${id}`, { method: "DELETE" }),
  url: (id: string) => `/dsh-plugin-file-preview/files/${id}`,
  ws: (path: string, kind: "raw" | "thumb" | "big") =>
    `/dsh-plugin-file-preview/ws?path=${encodeURIComponent(path)}&kind=${kind}`,
};

/** Pick the preview mode for a produced workspace file from its extension. */
function wsPreviewMode(name: string): "image" | "pdf" | "text" | "big" {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (
    ["md", "markdown", "txt", "log", "json", "jsonl", "csv", "tsv", "html", "css", "js", "mjs", "ts", "tsx", "py", "sh", "yaml", "yml", "toml", "xml"].includes(
      ext,
    )
  )
    return "text";
  return "big";
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/* ── shared panel store ───────────────────────────────────────────────── */

type WsPreview = {
  name: string;
  path: string;
  openFile: (() => void) | null;
};

type PanelState = {
  open: boolean;
  sessionId: string | null;
  files: PreviewFile[];
  selectedId: string | null;
  uploading: boolean;
  listError: boolean;
  version: number;
  ws: WsPreview | null;
};

type PanelStore = {
  getSnapshot(): PanelState;
  subscribe(listener: () => void): () => void;
  open(sessionId: string): void;
  openWorkspace(ws: WsPreview): void;
  close(): void;
  select(id: string): void;
  refresh(): void;
  upload(fileList: FileList | File[]): Promise<void>;
  remove(id: string): Promise<void>;
};

const CLOSED: PanelState = {
  open: false,
  sessionId: null,
  files: [],
  selectedId: null,
  uploading: false,
  listError: false,
  version: 0,
  ws: null,
};

function createPanelStore(): PanelStore {
  let state: PanelState = CLOSED;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const set = (patch: Partial<PanelState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const refresh = () => {
    const sessionId = state.sessionId;
    if (!sessionId) return;
    API.list(sessionId)
      .then((result) => {
        if (!state.open || state.sessionId !== sessionId) return;
        const files = result.files ?? [];
        set({
          files,
          listError: false,
          version: state.version + 1,
          selectedId:
            state.selectedId && files.some((f) => f.id === state.selectedId)
              ? state.selectedId
              : (files[0]?.id ?? null),
        });
      })
      .catch(() => {
        if (state.open) set({ listError: true });
      });
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: (sessionId) => {
      if (state.open && state.sessionId === sessionId && state.ws === null) {
        refresh();
        return;
      }
      state = { ...CLOSED, open: true, sessionId };
      emit();
      refresh();
    },
    openWorkspace: (ws) => {
      state = { ...CLOSED, open: true, ws };
      emit();
    },
    close: () => {
      if (!state.open) return;
      state = { ...CLOSED };
      emit();
    },
    select: (id) => {
      if (state.open && id !== state.selectedId) set({ selectedId: id });
    },
    refresh,
    upload: async (fileList) => {
      const sessionId = state.sessionId;
      if (!sessionId || state.uploading) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;
      set({ uploading: true });
      try {
        for (const file of files) {
          const result = await API.upload(file, sessionId);
          if (!state.open) return;
          if (result.ok && result.file) {
            set({
              files: [result.file, ...state.files.filter((f) => f.id !== result.file.id)],
              version: state.version + 1,
            });
            state = { ...state, selectedId: result.file.id };
            emit();
          }
        }
      } catch {
        if (state.open) set({ listError: true });
      } finally {
        if (state.open) set({ uploading: false });
      }
    },
    remove: async (id) => {
      if (!state.open) return;
      await API.remove(id);
      set({
        files: state.files.filter((f) => f.id !== id),
        version: state.version + 1,
        selectedId: state.selectedId === id ? (state.files.find((f) => f.id !== id)?.id ?? null) : state.selectedId,
      });
    },
  };
}

/* ── shared ui atoms ──────────────────────────────────────────────────── */

const ui = {
  mask: {
    position: "fixed",
    inset: 0,
    zIndex: 1200,
    background: "var(--dsw-alias-bg-mask-1, rgba(0,0,0,.45))",
    backdropFilter: "blur(var(--dsw-mask-blur, 4px))",
    pointerEvents: "auto",
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
    pointerEvents: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderBottom: "1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(0,0,0,.08))",
    fontSize: 15,
    fontWeight: 600,
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
    fontSize: 13,
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
    cursor: "pointer",
  },
  dropHint: {
    margin: 12,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px dashed var(--dsw-alias-border-l2, rgba(0,0,0,.18))",
    color: "var(--dsw-alias-label-caption, #999)",
    fontSize: 12,
    textAlign: "center",
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
    fontSize: 13,
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
    wordBreak: "break-word",
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
    fontSize: 13,
  },
} as const;

function bytesText(bytes: number): string {
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function timeText(time: number): string {
  if (!time) return "";
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 1.5h5.5L13 5v9.5H4V1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/* ── preview body ─────────────────────────────────────────────────────── */

const TEXT_MEDIA = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-ndjson",
]);

const TEXT_LIMIT = 200_000;

function PreviewBody({ file, url, t }: { file: PreviewFile; url: string; t: (key: string) => string }) {
  const mediaType = file.mediaType;
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TEXT_MEDIA.has(mediaType)) return;
    let cancelled = false;
    setText(null);
    setTruncated(false);
    setFailed(false);
    fetch(url)
      .then((response) => response.text())
      .then((value) => {
        if (cancelled) return;
        const cut = value.length > TEXT_LIMIT;
        setText(cut ? value.slice(0, TEXT_LIMIT) : value);
        setTruncated(cut);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, mediaType]);

  if (mediaType.startsWith("image/")) {
    return <img src={url} alt={file.name} style={ui.previewImage} />;
  }
  if (mediaType === "application/pdf") {
    return <iframe title={file.name} src={url} style={ui.previewFrame} />;
  }
  if (TEXT_MEDIA.has(mediaType)) {
    if (failed) return <div style={ui.center}>{t("loadFailed")}</div>;
    if (text === null) return <div style={ui.center}>{t("loading")}</div>;
    return (
      <pre style={ui.previewText}>
        {text}
        {truncated ? "\n" + t("textTruncated") : ""}
      </pre>
    );
  }
  return (
    <div style={ui.center}>
      <div style={{ marginBottom: 12 }}>{t("previewUnsupported")}</div>
      <a href={url} download={file.name} style={ui.action}>
        {t("download")} ({bytesText(file.bytes)})
      </a>
    </div>
  );
}

/* ── the two slot entries ─────────────────────────────────────────────── */

type HeaderProps = {
  sessionId: string;
  t: (key: string) => string;
  panel: PanelStore;
};

function AttachmentsButton({ sessionId, t, panel }: HeaderProps) {
  const state = useSyncExternalStore(panel.subscribe, panel.getSnapshot);
  const count = useMemo(
    () => (state.sessionId === sessionId && state.open ? state.files.length : -1),
    [state.sessionId, state.open, state.version, state.files.length, sessionId],
  );
  return (
    <button type="button" title={t("button")} style={ui.iconButton} onClick={() => panel.open(sessionId)}>
      {fileIcon()}
      {t("button")}
      {count > 0 && (
        <span style={{ color: "var(--dsw-alias-state-business-primary, #4d6bfe)", fontWeight: 600 }}>{count}</span>
      )}
    </button>
  );
}

type OverlayProps = {
  t: (key: string) => string;
  panel: PanelStore;
};

function PreviewPanel({ t, panel }: OverlayProps) {
  const state = useSyncExternalStore(panel.subscribe, panel.getSnapshot);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") panel.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, panel]);

  if (!state.open) return null;

  const selected = state.files.find((f) => f.id === state.selectedId) ?? null;
  const ws = state.ws;

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) void panel.upload(files);
  };

  return (
    <Fragment>
      <div style={ui.mask} onClick={() => panel.close()} />
      <div
        style={{
          ...ui.panel,
          outline: dragOver ? "2px dashed var(--dsw-alias-state-business-primary, #4d6bfe)" : "none",
          outlineOffset: -6,
        }}
        role="dialog"
        aria-label={t("panelTitle")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div style={ui.header}>
          <span style={ui.headerTitle}>{ws ? ws.name : `${t("panelTitle")} · ${state.files.length}`}</span>
          <button type="button" title={t("close")} style={ui.closeButton} onClick={() => panel.close()}>
            ✕
          </button>
        </div>

        {ws ? (
          <WsPreviewBody ws={ws} t={t} />
        ) : (
          <Fragment>
            <div style={ui.dropHint}>{state.uploading ? `${t("uploading")}…` : t("dropHint")}</div>

            {state.listError && (
              <div
                style={{
                  margin: "0 16px 8px",
                  fontSize: 12,
                  color: "var(--dsw-alias-state-error-primary, #d86161)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ flex: 1 }}>{t("uploadFailed")}</span>
                <button type="button" style={ui.action} onClick={() => panel.refresh()}>
                  {t("retry")}
                </button>
              </div>
            )}

            {state.files.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--dsw-alias-label-caption, #999)", fontSize: 13 }}>
                {t("empty")}
              </div>
            ) : (
              <div style={ui.list}>
                {state.files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    style={file.id === state.selectedId ? { ...ui.listItem, ...ui.listItemActive } : ui.listItem}
                    onClick={() => panel.select(file.id)}
                  >
                    {fileIcon()}
                    <span style={ui.fileName}>{file.name}</span>
                    <span style={ui.fileMeta}>{timeText(file.time)}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={ui.body}>
              {selected ? (
                <PreviewBody file={selected} url={API.url(selected.id)} t={t} />
              ) : (
                <div style={ui.center}>{state.files.length === 0 ? "" : t("empty")}</div>
              )}
            </div>

            {selected && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 16px 12px",
                  fontSize: 11,
                  color: "var(--dsw-alias-label-caption, #999)",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selected.mediaType} · {bytesText(selected.bytes)}
                </span>
                <a href={API.url(selected.id)} download={selected.name} style={ui.action}>
                  {t("download")}
                </a>
                <button
                  type="button"
                  style={ui.action}
                  onClick={() => {
                    void panel.remove(selected.id);
                  }}
                >
                  {t("delete")}
                </button>
              </div>
            )}
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

/* ── workspace file preview (produced-file cards) ─────────────────────── */

function WsPreviewBody({ ws, t }: { ws: WsPreview; t: (key: string) => string }) {
  const mode = wsPreviewMode(ws.name);
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);
  const rawUrl = API.ws(ws.path, "raw");

  useEffect(() => {
    if (mode !== "text") return;
    let cancelled = false;
    setText(null);
    setTruncated(false);
    setFailed(false);
    fetch(rawUrl)
      .then((response) => response.text())
      .then((value) => {
        if (cancelled) return;
        const cut = value.length > TEXT_LIMIT;
        setText(cut ? value.slice(0, TEXT_LIMIT) : value);
        setTruncated(cut);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [rawUrl, mode]);

  const body = (() => {
    if (mode === "image") return <img src={rawUrl} alt={ws.name} style={ui.previewImage} />;
    if (mode === "pdf") return <iframe title={ws.name} src={rawUrl} style={ui.previewFrame} />;
    if (mode === "text") {
      if (failed) return <div style={ui.center}>{t("loadFailed")}</div>;
      if (text === null) return <div style={ui.center}>{t("loading")}</div>;
      return (
        <pre style={ui.previewText}>
          {text}
          {truncated ? "\n" + t("textTruncated") : ""}
        </pre>
      );
    }
    return (
      <img
        src={API.ws(ws.path, "big")}
        alt={ws.name}
        style={ui.previewImage}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  })();

  return (
    <Fragment>
      <div style={ui.body}>{body}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px 12px",
          fontSize: 11,
          color: "var(--dsw-alias-label-caption, #999)",
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ws.path}
        </span>
        <a href={rawUrl} download={ws.name} style={ui.action}>
          {t("download")}
        </a>
        {ws.openFile && (
          <button type="button" style={ui.action} onClick={() => ws.openFile?.()}>
            {t("openLocal")}
          </button>
        )}
      </div>
    </Fragment>
  );
}

/* ── turn-tail chain entry: produced-file cards ───────────────────────── */

type TurnOwner = {
  turn: { data: { get(kind: string): { produced?: { seq: number; path: string }[] } | undefined } };
  seq?: number;
  openFile: (path: string) => void;
};

function selectProducedCards(owner: TurnOwner): string[] | null {
  const data = owner?.turn?.data?.get?.("deliverables");
  if (!data) return null;
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const produced of data.produced ?? []) {
    if (produced.seq > (owner.seq ?? Number.POSITIVE_INFINITY) || seen.has(produced.path)) continue;
    seen.add(produced.path);
    paths.push(produced.path);
  }
  return paths.length === 0 ? null : paths;
}

const uiCard = {
  root: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    padding: "4px 0 8px",
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
    textAlign: "left",
  },
  thumb: {
    width: "100%",
    height: 88,
    objectFit: "cover",
    display: "block",
    background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04))",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 8px",
    minWidth: 0,
  },
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
} as const;

type TurnTailProps = {
  turn: TurnOwner["turn"];
  seq: number | undefined;
  openFile: (path: string) => void;
  matched: string[];
  useSessions: (selector: (state: unknown) => unknown) => unknown;
  sessionId: string;
  t: (key: string) => string;
  panel: PanelStore;
};

function TurnTailPreview({ openFile, matched, useSessions, sessionId, t, panel }: TurnTailProps) {
  const sessions = useSessions((s) => s) as {
    byId?: Record<string, { cwd?: string }>;
  };
  const cwd = sessions?.byId?.[sessionId]?.cwd;

  const cards = useMemo(
    () =>
      matched.map((path) => {
        const name = baseName(path);
        // Engine locations are absolute; only bare relative paths get cwd-prefixed.
        const absolute = path.startsWith("/")
          ? path
          : cwd
            ? `${cwd.replace(/\/+$/, "")}/${path}`
            : path;
        return { path, name, absolute };
      }),
    [matched, cwd],
  );

  if (cards.length === 0) return null;

  return (
    <div style={uiCard.root}>
      <span style={{ fontSize: 11, color: "var(--dsw-alias-label-caption, #999)", alignSelf: "center" }}>
        {t("producedLabel")}
      </span>
      {cards.map((card) => (
        <button
          key={card.path}
          type="button"
          title={`${card.path}\n${t("preview")} · ${t("openLocal")}`}
          style={uiCard.card}
          onClick={() => panel.openWorkspace({ name: card.name, path: card.absolute, openFile: () => openFile(card.path) })}
        >
          <img
            src={API.ws(card.absolute, "thumb")}
            alt=""
            style={uiCard.thumb}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
          <span style={uiCard.label}>
            <span style={uiCard.name}>{card.name}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── plugin body ──────────────────────────────────────────────────────── */

const inject = ["slots", "locale"];

function apply(ctx: {
  effect(register: () => (() => void) | void, label?: string): void;
  slots: {
    inject(slotName: string, callback: () => (() => void) | void): void;
    register(spec: unknown, Component: unknown): () => void;
  };
  locale: {
    register(ns: string, locale: string, dict: Record<string, string>): () => void;
    bind(ns: string): (key: string) => string;
  };
}) {
  ctx.effect(() => ctx.locale.register(NS, "zh", zh), "file-preview: zh dictionary");
  ctx.effect(() => ctx.locale.register(NS, "en", en), "file-preview: en dictionary");

  const t = ctx.locale.bind(NS);
  const panel = createPanelStore();

  ctx.slots.inject("conversation.session.header.utilities", () =>
    ctx.slots.register(
      {
        name: "conversation.session.header.utilities",
        id: "file-preview-attachments",
        order: 0,
        inject: () => ({
          t,
          panel,
        }),
      },
      AttachmentsButton,
    ),
  );

  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: "file-preview-panel",
        inject: () => ({
          t,
          panel,
        }),
      },
      PreviewPanel,
    ),
  );

  // Chain entry over the per-turn tail: claims (priority -1) whenever the
  // turn produced files, rendering preview cards instead of the shipped
  // produced-files row. Declines otherwise, so the shipped row never loses
  // its fallback.
  ctx.slots.inject("conversation.chat.turnTail", () =>
    ctx.slots.register(
      {
        name: "conversation.chat.turnTail",
        id: "file-preview-turn-tail",
        priority: -1,
        select: selectProducedCards,
        inject: () => ({
          t,
          panel,
        }),
      },
      TurnTailPreview,
    ),
  );
}

export { apply, inject };
