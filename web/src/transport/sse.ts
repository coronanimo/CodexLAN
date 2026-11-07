import { readJson } from "./http";

let lastSessionProbe = 0;
function probeSession() {
  if (Date.now() - lastSessionProbe < 10_000) return;
  lastSessionProbe = Date.now(); void readJson("/api/auth/session").catch(() => {});
}

export function openSequencedStream<T extends { kind: string }>(path: string, eventName: string,
  receive: (event: T) => boolean | void, status: (message: string) => void = () => {}) {
  let stream: EventSource, stopped = false, retry: ReturnType<typeof setTimeout> | undefined, lastMessage = Date.now();
  const connect = () => {
    if (stopped) return;
    stream?.close();
    const current = stream = new EventSource(path);
    let epoch = "", sequence = 0;
    current.addEventListener("open", () => { epoch = ""; sequence = 0; status("正在同步…"); });
    current.addEventListener("error", () => { status("连接中断，正在重新连接…"); probeSession(); });
    current.addEventListener(eventName, (message) => {
      if (stopped || current !== stream) return;
      try {
        const value = JSON.parse((message as MessageEvent).data);
        if (typeof value.epoch !== "string" || !Number.isSafeInteger(value.sequence)) throw new Error();
        lastMessage = Date.now();
        if (value.kind === "error") { status(String(value.message || "读取失败，正在重新连接…")); return; }
        if (value.kind === "snapshot" && value.sequence === 1 && !sequence) epoch = value.epoch;
        if (!epoch || value.epoch !== epoch || value.sequence !== sequence + 1) throw new Error();
        sequence = value.sequence;
        if (value.kind === "heartbeat") return;
        if (receive(value as T) === false) close();
      } catch {
        status("实时数据需要重新同步…"); current.close(); clearTimeout(retry); retry = setTimeout(connect, 2000);
      }
    });
  };
  const resume = (event: Event) => {
    const stale = Date.now() - lastMessage > (event.type === "codex-native-resume" ? 2000 : 40_000);
    if (!document.hidden && stale && !stopped) { clearTimeout(retry); connect(); }
  };
  const close = () => {
    stopped = true; clearTimeout(retry); stream?.close();
    document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume);
    window.removeEventListener("pageshow", resume); window.removeEventListener("codex-native-resume", resume);
  };
  document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
  window.addEventListener("pageshow", resume); window.addEventListener("codex-native-resume", resume);
  connect(); return close;
}
