import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(process.env.PREVIEW_DIRECTORY || "out");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url!, "http://localhost").pathname,
    );
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, "." + path);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(await readFile(resolve(root, "404.html")));
  }
}).listen(3000, "127.0.0.1", () => console.log("Local: http://localhost:3000"));
