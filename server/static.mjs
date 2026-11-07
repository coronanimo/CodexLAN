import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import express from "express";

export function registerStatic(application, root) {
  application.use(express.static(root, {
    index: "index.html", etag: true, fallthrough: true,
    setHeaders(response, path) {
      response.setHeader("Cache-Control", /[/\\]assets[/\\]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
    },
  }));
  application.use((request, response) => {
    if (request.path === "/" && !existsSync(join(root, "index.html"))) return response.status(503).type("text").send("React 页面尚未构建。请在源码目录运行 npm run web:build。");
    response.status(404).type("text").send("Not found");
  });
}
export function staticVersion(root) {
  const entry = join(root, "index.html");
  return existsSync(entry) ? `react-${Math.trunc(statSync(entry).mtimeMs)}` : "react-unbuilt";
}
