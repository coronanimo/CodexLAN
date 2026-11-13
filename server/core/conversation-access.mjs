import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { httpError } from "../workspace-store.mjs";

// A parallel installation can read the existing catalog, but only conversations
// it explicitly created may receive writes or automatic queue delivery.
export class ConversationAccess {
  owned = new Set(); writing = Promise.resolve();
  constructor(dataRoot, parallel = false) { this.parallel = parallel; this.path = join(dataRoot, "parallel-owned-conversations.json"); }
  async load() {
    if (!this.parallel) return;
    const content = await readFile(this.path, "utf8").catch((error) => { if (error.code === "ENOENT") return "[]"; throw error; });
    const ids = JSON.parse(content);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]+$/i.test(id))) throw new Error("并行实例的会话归属记录无效。");
    this.owned = new Set(ids);
  }
  writable = (id) => !this.parallel || this.owned.has(id);
  requireWrite(id) { if (!this.writable(id)) throw httpError(403, "并行版中原有会话只读；请新建会话试用执行功能。原版继续处理原有任务。"); }
  async created(id) {
    if (!this.parallel) return;
    const operation = this.writing.catch(() => {}).then(async () => {
      const owned = new Set(this.owned); owned.add(id);
      await writeFile(this.path + ".tmp", JSON.stringify([...owned]), { mode: 0o600 });
      await rename(this.path + ".tmp", this.path); this.owned = owned;
    });
    this.writing = operation; await operation;
  }
}
