import type { ConversationSelection, HistoryPage, ReadClient } from "@lan/read-api";
import type { AppStore } from "../store";
import { conversationReleased, orderedRowsPrepended, snapshotCommitted } from "../../features/conversation/model/conversationSlice";

// One selected conversation owns its reads. No component or virtual row owns a
// history connection. Generation checks also cover clients ignoring abort.
export class ConversationReader {
  private selection: ConversationSelection | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private before: string | null = null;
  constructor(private client: ReadClient, private store: AppStore) {}

  open(selection: ConversationSelection) {
    this.close();
    this.selection = selection;
    return this.read(false);
  }
  refresh() { return this.read(false); }
  older() { return this.before ? this.read(true) : Promise.resolve(null); }
  close() {
    this.controller?.abort();
    this.generation++;
    if (this.selection) this.store.dispatch(conversationReleased(this.selection.conversationId));
    this.selection = null;
    this.before = null;
  }
  private async read(older: boolean): Promise<HistoryPage | null> {
    const selection = this.selection;
    if (!selection) return null;
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const generation = ++this.generation;
    try {
      const page = await this.client.history(selection, older ? this.before : null, controller.signal);
      if (controller.signal.aborted || generation !== this.generation) return null;
      this.store.dispatch((older ? orderedRowsPrepended : snapshotCommitted)({ conversationId: selection.conversationId, rows: page.rows }));
      this.before = page.before;
      return page;
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return null;
      throw error;
    }
  }
}
