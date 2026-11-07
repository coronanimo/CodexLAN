import type { ReadClient, ConversationSelection } from "@lan/read-api";
import type { UploadedFile } from "@lan/workspace";

export type Attachment = { id: string; file: File; progress: number; uploaded?: UploadedFile; error?: string };
const EMPTY: Attachment[] = [];
export class Attachments {
  private values = new Map<string, Attachment[]>();
  private listeners = new Map<string, Set<() => void>>();
  private requests = new Map<string, { promise: Promise<UploadedFile>; controller: AbortController }>();
  constructor(private client: ReadClient) {}
  get = (id: string) => this.values.get(id) || EMPTY;
  subscribe(id: string, listener: () => void) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(listener);
    return () => { this.listeners.get(id)?.delete(listener); };
  }
  private changed(id: string) {
    this.values.set(id, [...this.get(id)]);
    for (const listener of this.listeners.get(id) || []) listener();
  }
  add(id: string, files: File[]) {
    this.values.set(id, [...this.get(id), ...files.map((file) => ({ id: crypto.randomUUID(), file, progress: 0 }))]); this.changed(id);
  }
  remove(id: string, itemId: string) {
    this.requests.get(itemId)?.controller.abort();
    this.values.set(id, this.get(id).filter((item) => item.id !== itemId)); this.changed(id);
  }
  async upload(selection: ConversationSelection, items: Attachment[]) {
    if (!this.client.upload) throw new Error("当前连接不支持附件。");
    const result: UploadedFile[] = [];
    for (const item of items) {
      if (item.uploaded) { result.push(item.uploaded); continue; }
      let request = this.requests.get(item.id);
      if (!request) {
        const controller = new AbortController();
        const promise = this.client.upload(selection, item.file, controller.signal, (ratio) => { item.progress = ratio; this.changed(selection.conversationId); })
          .then((value) => { item.uploaded = value; item.error = undefined; this.changed(selection.conversationId); return value; })
          .catch((error: Error) => { item.error = error.message; this.changed(selection.conversationId); throw error; })
          .finally(() => this.requests.delete(item.id));
        request = { controller, promise }; this.requests.set(item.id, request);
      }
      result.push(await request.promise);
    }
    return result;
  }
  clearSent(id: string, sent: Attachment[]) {
    const ids = new Set(sent.map((item) => item.id)); this.values.set(id, this.get(id).filter((item) => !ids.has(item.id))); this.changed(id);
  }
  close() { for (const request of this.requests.values()) request.controller.abort(); this.values.clear(); }
}
