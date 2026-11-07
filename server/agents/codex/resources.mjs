import { mkdtemp, open, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { httpError } from "../../workspace-store.mjs";

// Native APIs return a complete item. Spool that response once, then serve
// bounded slices without rereading the entire item for every browser page.
export class CodexResources {
  entries = new Map(); loading = new Map(); bytes = 0; directory = null; closed = false;
  async slice(key, offset, load) {
    let entry = this.entries.get(key);
    if (entry && Date.now() - entry.created > 10 * 60_000) { await this.discard(key); entry = null; }
    if (!entry) {
      if (!this.loading.has(key)) {
        if (this.loading.size >= 4) throw httpError(429, "正在读取其他输出，请稍后重试。");
        this.loading.set(key, this.materialize(key, load).finally(() => this.loading.delete(key)));
      }
      entry = await this.loading.get(key);
    }
    if (this.closed) throw new Error("输出读取已关闭。");
    if (offset > entry.characters) throw httpError(409, "输出位置已变化，请回到开头。");
    this.entries.delete(key); this.entries.set(key, entry); entry.leases++;
    let file;
    try {
      file = await open(entry.path, "r");
      let length = Math.min(16_000, entry.characters - offset);
      const buffer = Buffer.alloc(length * 2);
      await file.read(buffer, 0, buffer.length, offset * 2);
      let text = buffer.toString("utf16le");
      if (offset + length < entry.characters && /[\uD800-\uDBFF]$/.test(text)) { length--; text = text.slice(0, -1); }
      return { text, nextOffset: offset + length < entry.characters ? offset + length : null, metadata: entry.metadata };
    } finally { await file?.close(); if (!--entry.leases && entry.discarded) await unlink(entry.path).catch(() => {}); }
  }
  async materialize(key, load) {
    const value = await load(), body = typeof value === "string" ? value : value.body, bytes = body.length * 2;
    if (bytes > 128 * 1024 * 1024) throw httpError(413, "单条输出超过 128 MB 读取上限，请从项目原始文件下载。");
    while (this.entries.size && (this.entries.size >= 32 || this.bytes + bytes > 128 * 1024 * 1024)) await this.discard(this.entries.keys().next().value);
    this.directory ||= mkdtemp(join(tmpdir(), "codexlan-output-"));
    const path = join(await this.directory, randomUUID());
    await writeFile(path, body, "utf16le");
    if (this.closed) { await unlink(path); throw new Error("输出读取已关闭。"); }
    const entry = { path, bytes, characters: body.length, metadata: value.metadata, created: Date.now(), leases: 0 };
    this.entries.set(key, entry); this.bytes += bytes;
    while (this.entries.size > 32 || this.bytes > 128 * 1024 * 1024) await this.discard(this.entries.keys().next().value);
    return entry;
  }
  async discard(key) {
    const entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.bytes -= entry.bytes; entry.discarded = true; if (!entry.leases) await unlink(entry.path).catch(() => {}); }
  }
  async close() { this.closed = true; await Promise.allSettled([...this.loading.values()]); for (const key of this.entries.keys()) await this.discard(key); if (this.directory) await rmdir(await this.directory).catch(() => {}); }
}
