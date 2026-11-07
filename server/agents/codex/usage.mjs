export class CodexUsage {
  buckets = new Map(); versions = new Map(); tokens = new Map(); sequence = 0; expires = 0; loading = null;
  constructor(connection) { this.connection = connection; }
  update(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    const id = snapshot.limitId || "codex", previous = this.buckets.get(id) || {};
    this.buckets.set(id, { ...previous, ...snapshot }); this.versions.set(id, ++this.sequence);
  }
  async limits() {
    if (this.expires <= Date.now() && !this.loading) {
      const checkpoint = this.sequence;
      this.loading = this.connection.request("account/rateLimits/read", {}).then((response) => {
        for (const snapshot of Object.values(response.rateLimitsByLimitId || { codex: response.rateLimits })) {
          if (snapshot && (this.versions.get(snapshot.limitId || "codex") || 0) <= checkpoint) this.update(snapshot);
        }
        this.expires = Date.now() + 60_000;
      }).catch(() => { this.expires = Date.now() + 5000; }).finally(() => { this.loading = null; });
    }
    await this.loading;
    return [...this.buckets].slice(0, 20).map(([id, snapshot]) => ({ id, label: String(snapshot.limitName || id).slice(0, 100),
      windows: [snapshot.primary, snapshot.secondary].filter(Boolean).map((window) => ({ usedPercent: finite(window.usedPercent), minutes: finite(window.windowDurationMins), resetsAt: finite(window.resetsAt) })) }));
  }
  async snapshot(id) {
    const usage = this.tokens.get(id);
    return { totalTokens: finite(usage?.total?.totalTokens), contextTokens: finite(usage?.last?.totalTokens), contextWindow: finite(usage?.modelContextWindow), limits: await this.limits() };
  }
}
function finite(value) { return Number.isFinite(value) && value >= 0 ? value : null; }
