const MAX_RECORDS = 800;
const enabled = new URLSearchParams(location.search).has("profiling")
  || localStorage.getItem("codexlan-profiling") === "1";
const records = [];
const counts = new Map();

function now() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function record(type, data = {}) {
  if (!enabled) return;
  const entry = { at: new Date().toISOString(), t: Math.round(now() * 100) / 100, type, ...data };
  records.push(entry);
  while (records.length > MAX_RECORDS) records.shift();
  counts.set(type, (counts.get(type) || 0) + 1);
}

export function profileMark(type, data) {
  record(type, data);
}

export function profileSpan(type, data = {}) {
  const started = now();
  return (extra = {}) => {
    const durationMs = Math.round((now() - started) * 100) / 100;
    record(type, { ...data, ...extra, durationMs });
    return durationMs;
  };
}

function report() {
  const summary = [...counts.entries()].map(([type, count]) => ({ type, count }));
  return { enabled, records: records.slice(), summary };
}

function download() {
  const blob = new Blob([JSON.stringify(report(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `codexlan-profile-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

if (enabled) {
  window.codexlanProfiler = { enabled: true, report, download, clear: () => records.splice(0), mark: profileMark };
  console.info("CodexLAN profiling enabled. Use codexlanProfiler.report() or codexlanProfiler.download().");
  if (typeof PerformanceObserver === "function") {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record("longtask", { durationMs: Math.round(entry.duration * 100) / 100 });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch { /* longtask is not available in every browser */ }
  }
  window.addEventListener("error", (event) => record("error", { message: event.message, source: event.filename, line: event.lineno }));
  window.addEventListener("unhandledrejection", (event) => record("unhandledrejection", { message: String(event.reason?.message || event.reason) }));
}

export const profilingEnabled = enabled;
