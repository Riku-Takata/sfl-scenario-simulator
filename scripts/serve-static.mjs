import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = path.resolve(process.cwd(), "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'none';",
};

const server = http.createServer((req, res) => {
  // 1. 静的配信専用のため GET / HEAD 以外のメソッド（POST/PUT/DELETE等）は即座に拒否
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      Allow: "GET, HEAD",
    });
    res.end("Method Not Allowed");
    return;
  }

  let pathname = "/";
  try {
    const urlObj = new URL(req.url || "/", "http://localhost");
    pathname = decodeURIComponent(urlObj.pathname);
  } catch {
    res.writeHead(400, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Bad Request");
    return;
  }

  if (pathname.includes("\0")) {
    res.writeHead(400, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Bad Request");
    return;
  }

  if (pathname === "/api/health" || pathname === "/api/health.json") {
    const healthFile = path.join(DIST_DIR, "api", "health.json");
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    });
    if (fs.existsSync(healthFile)) {
      res.end(fs.readFileSync(healthFile));
    } else {
      res.end(
        JSON.stringify({ status: "ok", service: "sfl-scenario-simulator" })
      );
    }
    return;
  }

  // 2. パストラバーサル防止（正規化後のパスが DIST_DIR 配下であることを厳密検証）
  let filePath = path.resolve(DIST_DIR, `.${pathname}`);
  const isInsideDist =
    filePath === DIST_DIR || filePath.startsWith(`${DIST_DIR}${path.sep}`);
  if (!isInsideDist) {
    res.writeHead(403, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
    filePath = `${filePath}.html`;
  } else if (
    !fs.existsSync(filePath) &&
    fs.existsSync(path.join(filePath, "index.html"))
  ) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const notFoundPage = path.join(DIST_DIR, "404.html");
    res.writeHead(404, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    });
    res.end(
      fs.existsSync(notFoundPage) ? fs.readFileSync(notFoundPage) : "Not Found"
    );
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": contentType,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(
    `SFL 2026 Astro Static Server listening on http://${HOST}:${PORT}`
  );
});
