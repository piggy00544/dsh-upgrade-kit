/**
 * dsh-plugin-file-preview — host half.
 *
 * The rc.7 attachment pipeline is unfinished host-side (prompt images are
 * dropped before persistence and no attachment RPC exists), so this plugin
 * owns a minimal self-contained file drawer instead:
 *
 *   PUT  /dsh-plugin-file-preview/files?name=&mediaType=&sessionId=   (raw body)
 *   GET  /dsh-plugin-file-preview/list?sessionId=
 *   GET  /dsh-plugin-file-preview/files/<uuid>
 *   DEL  /dsh-plugin-file-preview/files/<uuid>
 *
 * Files live under <DSH_HOME>/dsh-plugin-file-preview/files (uuid-named) with
 * one metadata line per file in index.jsonl. The browser half ships via
 * exports["./client"], discovered through the package.json dsh.client
 * declaration.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

const MAX_BYTES = 64 * 1024 * 1024;
const WS_MAX_BYTES = 24 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

const MEDIA_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".json": "application/json",
  ".jsonl": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".py": "text/plain",
  ".sh": "text/plain",
  ".yaml": "text/plain",
  ".yml": "text/plain",
  ".toml": "text/plain",
  ".xml": "text/xml",
};

function guessMediaType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MEDIA_BY_EXT[ext] ?? "application/octet-stream";
}

function thumbsDir() {
  return join(storageRoot(), "thumbs");
}

/** Resolve one workspace file to a canonical absolute path, or null when out of bounds. */
function resolveWorkspacePath(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  const target = raw.split("?")[0];
  const homePrefix = homedir() + "/";
  if (!target.startsWith(homePrefix)) return null;
  if (target.includes("\u0000") || target.includes("..")) return null;
  return target;
}

function qlThumb(filePath, size) {
  const stat = statSync(filePath);
  const digest = createHash("sha1")
    .update(filePath)
    .update(":")
    .update(String(stat.mtimeMs))
    .update(":")
    .update(String(stat.size))
    .digest("hex");
  const cached = join(thumbsDir(), `${digest}-${size}.png`);
  if (existsSync(cached)) return cached;
  mkdirSync(thumbsDir(), { recursive: true });
  const tmp = join(thumbsDir(), `tmp-${randomUUID()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    execFileSync("/usr/bin/qlmanage", ["-t", "-s", String(size), "-o", tmp, filePath], {
      timeout: 20000,
      stdio: "ignore",
    });
    const produced = join(tmp, `${basename(filePath)}.png`);
    if (!existsSync(produced)) return null;
    writeFileSync(cached, readFileSync(produced));
    return cached;
  } catch {
    return null;
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

export const inject = ["webServer"];

function storageRoot() {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "dsh-plugin-file-preview");
}
function filesDir() {
  return join(storageRoot(), "files");
}
function indexPath() {
  return join(storageRoot(), "index.jsonl");
}

function sanitizeName(raw) {
  const cleaned = String(raw ?? "")
    .replace(/[/\\]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .trim();
  return (cleaned || "unnamed").slice(0, 200);
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body exceeds limit"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readIndex() {
  const path = indexPath();
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row !== null);
}

function apply(ctx) {
  mkdirSync(filesDir(), { recursive: true });
  ctx.effect(() => {
    const offPut = ctx.webServer.register({
      kind: "exact",
      path: "/dsh-plugin-file-preview/files",
      handler: async (req, res) => {
        if (req.method !== "PUT") {
          json(res, 405, { ok: false, error: "method-not-allowed" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://x");
        let body;
        try {
          body = await readBody(req, MAX_BYTES);
        } catch {
          json(res, 413, { ok: false, error: "too-large" });
          return;
        }
        const id = randomUUID();
        const safeName = sanitizeName(url.searchParams.get("name"));
        // 上传目录：绝对路径可被 @ 引用（模型直接读），文件名带时间戳防覆盖
        const uploadsDir = join(homedir(), ".local", "share", "dsh-upgrade-kit", "uploads");
        mkdirSync(uploadsDir, { recursive: true });
        const path = join(uploadsDir, `${Date.now()}-${safeName}`);
        const row = {
          id,
          name: safeName,
          path,
          mediaType: String(url.searchParams.get("mediaType") ?? "application/octet-stream").slice(0, 128),
          bytes: body.length,
          time: Date.now(),
          sessionId: String(url.searchParams.get("sessionId") ?? "").slice(0, 128),
        };
        writeFileSync(path, body);
        appendFileSync(indexPath(), JSON.stringify(row) + "\n");
        json(res, 200, { ok: true, file: row });
      },
    });

    const offList = ctx.webServer.register({
      kind: "exact",
      path: "/dsh-plugin-file-preview/list",
      handler: (req, res) => {
        if (req.method !== "GET") {
          json(res, 405, { ok: false, error: "method-not-allowed" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://x");
        const sessionId = String(url.searchParams.get("sessionId") ?? "");
        const rows = readIndex()
          .filter((row) => row.sessionId === sessionId)
          .sort((a, b) => b.time - a.time);
        json(res, 200, { ok: true, files: rows });
      },
    });

    const offFiles = ctx.webServer.register({
      kind: "prefix",
      path: "/dsh-plugin-file-preview/files",
      handler: (req, res) => {
        const pathname = new URL(req.url ?? "/", "http://x").pathname;
        const id = pathname.slice("/dsh-plugin-file-preview/files/".length);
        if (!ID_PATTERN.test(id) || id.includes("..")) {
          json(res, 404, { ok: false, error: "not-found" });
          return;
        }
        const filePath = join(filesDir(), id);
        const meta = readIndex().find((row) => row.id === id);
        if (req.method === "DELETE") {
          if (existsSync(filePath)) rmSync(filePath);
          json(res, 200, { ok: true });
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          json(res, 405, { ok: false, error: "method-not-allowed" });
          return;
        }
        if (!existsSync(filePath)) {
          json(res, 404, { ok: false, error: "not-found" });
          return;
        }
        const body = readFileSync(filePath);
        res.writeHead(200, {
          "content-type": (meta?.mediaType ?? "application/octet-stream") + "; charset=utf-8",
          "content-length": body.length,
          "content-disposition": `inline; filename="${encodeURIComponent(meta?.name ?? id)}"`,
          "cache-control": "no-cache",
        });
        if (req.method === "GET") res.end(body);
        else res.end();
      },
    });

    const offWs = ctx.webServer.register({
      kind: "exact",
      path: "/dsh-plugin-file-preview/ws",
      handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          json(res, 405, { ok: false, error: "method-not-allowed" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://x");
        const filePath = resolveWorkspacePath(url.searchParams.get("path"));
        const kindParam = url.searchParams.get("kind");
        const kind = kindParam === "thumb" || kindParam === "big" ? kindParam : "raw";
        if (filePath === null || !existsSync(filePath)) {
          json(res, 404, { ok: false, error: "not-found" });
          return;
        }
        if (kind !== "raw") {
          const size = kind === "thumb" ? 480 : 2400;
          const png = qlThumb(filePath, size);
          if (png === null) {
            json(res, 415, { ok: false, error: "no-quicklook" });
            return;
          }
          const body = readFileSync(png);
          res.writeHead(200, {
            "content-type": "image/png",
            "content-length": body.length,
            "cache-control": "no-cache",
          });
          if (req.method === "GET") res.end(body);
          else res.end();
          return;
        }
        const stat = statSync(filePath);
        if (!stat.isFile() || stat.size > WS_MAX_BYTES) {
          json(res, 413, { ok: false, error: "too-large-or-not-file" });
          return;
        }
        const body = readFileSync(filePath);
        res.writeHead(200, {
          "content-type": guessMediaType(filePath) + "; charset=utf-8",
          "content-length": body.length,
          "content-disposition": `inline; filename="${encodeURIComponent(basename(filePath))}"`,
          "cache-control": "no-cache",
        });
        if (req.method === "GET") res.end(body);
        else res.end();
      },
    });

    return () => {
      offPut();
      offList();
      offFiles();
      offWs();
    };
  }, "file-preview: http routes");
}

export { apply };
