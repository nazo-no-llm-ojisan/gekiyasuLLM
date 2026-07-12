import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** Repo root dashboard/ next to packages/ */
export function dashboardRootDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/ or dist/
  return path.resolve(here, "..", "..", "..", "dashboard");
}

/**
 * Serve static files under /dashboard/ (no auth).
 * Returns true if handled.
 */
export function tryServeDashboard(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) {
    return false;
  }

  const root = dashboardRootDir();
  let rel = pathname === "/dashboard" || pathname === "/dashboard/"
    ? "index.html"
    : pathname.slice("/dashboard/".length);

  // Path traversal guard
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return true;
  }

  let filePath = resolved;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
