import { useEffect, useRef, useState } from "react";
import type { ConversationSummary, ReadClient } from "@lan/read-api";

type Result = ConversationSummary & { snippet: string; projectName: string };
export function useSearch(client: ReadClient, agentId: string) {
  const [query, setQuery] = useState(""), [results, setResults] = useState<Result[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort(); const controller = request.current = new AbortController();
    setResults([]); setCursor(null); setError("");
    if (!query.trim() || !client.search) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      client.search!(agentId, query.trim(), null, controller.signal).then((page) => {
        if (!controller.signal.aborted) { setResults(page.results); setCursor(page.nextCursor); }
      }).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); request.current?.abort(); };
  }, [client, agentId, query]);
  const more = async () => {
    if (!cursor || !client.search || loading) return;
    request.current?.abort(); const controller = request.current = new AbortController(); setLoading(true);
    try {
      const page = await client.search(agentId, query.trim(), cursor, controller.signal);
      if (!controller.signal.aborted) { setResults((current) => [...current, ...page.results.filter((item) => !current.some((old) => old.id === item.id))]); setCursor(page.nextCursor); }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "搜索失败。"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return { query, setQuery, results, cursor, loading, error, more };
}
