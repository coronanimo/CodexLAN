import { useContext, useEffect, useRef, useState } from "react";
import type { DetailPage } from "@lan/read-api";
import { ReadContext } from "../../transport/ReadContext";

export function useDetailPage(ref: string) {
  const source = useContext(ReadContext);
  const request = useRef<AbortController | null>(null);
  const [page, setPage] = useState<DetailPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  const load = async (offset: number) => {
    if (!source) return;
    request.current?.abort();
    const controller = request.current = new AbortController();
    setLoading(true); setError("");
    try {
      const result = await source.client.details(source.selection, ref, offset, controller.signal);
      if (!controller.signal.aborted) setPage(result);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "读取失败。");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return { available: Boolean(source), page, error, loading, load };
}
