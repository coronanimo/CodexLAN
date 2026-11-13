import { mkdtemp, open, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { httpError } from "../../workspace-store.mjs";

// Native APIs return a complete item. Spool that response once, then serve
// bounded slices without rereading the entire item for every browser page.
export class CodexResources {
  entries = new Map(); loading = new Map(); bytes = 0; directory = null; closed = false;
  constructor({ maxEntries = 32, maxBytes = 128 * 1024 * 1024 } = {}) { this.maxEntries = maxEntries; this.maxBytes = maxBytes; }
  async acquire(key, load) {
    if (this.closed) throw new Error("输出读取已关闭。");
    let entry = this.entries.get(key);
    if (entry && Date.now() - entry.created > 10 * 60_000) { await this.discard(key); entry = this.entries.get(key); }
    if (this.closed) throw new Error("输出读取已关闭。");
    if (entry) {
      entry.leases++;
      this.entries.delete(key); this.entries.set(key, entry);
      return entry;
    }
    if (!entry) {
      if (!this.loading.has(key)) {
        if (this.loading.size >= 4) throw httpError(429, "正在读取其他输出，请稍后重试。");
        const pending = { waiters: 0, entry: null, promise: null };
        this.loading.set(key, pending);
        pending.promise = this.materialize(key, load, pending).finally(() => this.loading.delete(key));
      }
      const pending = this.loading.get(key);
      if (pending.entry) pending.entry.leases++;
      else pending.waiters++;
      entry = await pending.promise;
    }
    return entry;
  }
  async release(entry) {
    if (!--entry.leases && entry.discarded) await unlink(entry.path).catch(() => {});
    if (this.closed && this.directory) await rmdir(await this.directory).catch(() => {});
  }
  async slice(key, offset, load) {
    const entry = await this.acquire(key, load);
    let file;
    try {
      if (this.closed) throw new Error("输出读取已关闭。");
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > entry.characters) throw httpError(409, "输出位置已变化，请回到开头。");
      file = await open(entry.path, "r");
      let length = Math.min(16_000, entry.characters - offset);
      const buffer = Buffer.alloc(length * 2);
      await file.read(buffer, 0, buffer.length, offset * 2);
      let text = buffer.toString("utf16le");
      if (offset + length < entry.characters && /[\uD800-\uDBFF]$/.test(text)) { length--; text = text.slice(0, -1); }
      return { text, nextOffset: offset + length < entry.characters ? offset + length : null, metadata: entry.metadata };
    } finally { await file?.close(); await this.release(entry); }
  }
  async materialize(key, load, pending) {
    const value = await load(), body = typeof value === "string" ? value : value.body, bytes = body.length * 2;
    if (bytes > this.maxBytes) throw httpError(413, "单条输出超过读取上限，请从项目原始文件下载。");
    while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes)) await this.discard(this.entries.keys().next().value);
    this.directory ||= mkdtemp(join(tmpdir(), "codexlan-output-"));
    const path = join(await this.directory, randomUUID());
    await writeFile(path, body, "utf16le");
    if (this.closed) { await unlink(path); throw new Error("输出读取已关闭。"); }
    const entry = { path, bytes, characters: body.length, metadata: value.metadata, created: Date.now(), leases: pending.waiters };
    pending.entry = entry;
    this.entries.set(key, entry); this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) await this.discard(this.entries.keys().next().value);
    return entry;
  }
  async discard(key) {
    const entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.bytes -= entry.bytes; entry.discarded = true; if (!entry.leases) await unlink(entry.path).catch(() => {}); }
  }
  async close() { this.closed = true; await Promise.allSettled([...this.loading.values()].map((pending) => pending.promise)); for (const key of this.entries.keys()) await this.discard(key); if (this.directory) await rmdir(await this.directory).catch(() => {}); }
}
