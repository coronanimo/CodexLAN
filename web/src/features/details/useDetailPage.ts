import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ReadContext } from "../../transport/ReadContext";
import type { DetailView } from "../../transport/ReadContext";
import { useAppSelector } from "../../app/hooks";

export function useDetailPage(ref: string, rowId?: string) {
  const source = useContext(ReadContext);
  const key = JSON.stringify([source?.selection, ref]);
  const [view, setView] = useState<DetailView>(() => source?.details?.get(key) || { open: false, page: null, cursor: null });
  const current = useRef(view);
  const request = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const resourceRevision = useAppSelector((state) => source && rowId ? state.resources[source.selection.conversationId]?.[rowId] || 0 : 0);
  const lastRead = useRef(0), appliedRevision = useRef(resourceRevision);
  const revisionNow = useRef(resourceRevision); revisionNow.current = resourceRevision;
  useEffect(() => () => request.current?.abort(), []);
  const commit = useCallback((patch: Partial<DetailView>) => {
    const value = { ...current.current, ...patch }; current.current = value;
    if (source?.details) {
      source.details.delete(key); source.details.set(key, value);
      if (source.details.size > 32) source.details.delete(source.details.keys().next().value!);
    }
    setView(value);
  }, [source, key]);
  const load = useCallback(async (cursor: string | null) => {
    if (!source) return;
    request.current?.abort();
    const controller = request.current = new AbortController();
    setLoading(true); setError("");
    lastRead.current = Date.now(); appliedRevision.current = revisionNow.current;
    try {
      const result = await source.client.details(source.selection, ref, cursor, controller.signal);
      if (!controller.signal.aborted) commit({ page: result, cursor });
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "读取失败。");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [source, ref, commit]);
  useEffect(() => {
    if (!view.open || loading || resourceRevision === appliedRevision.current || view.cursor !== null) return;
    const timer = setTimeout(() => void load(null), Math.max(0, 500 - (Date.now() - lastRead.current)));
    return () => clearTimeout(timer);
  }, [resourceRevision, view.open, view.cursor, loading, load]);
  useEffect(() => { if (view.open && !view.page) void load(view.cursor); }, [view.open, view.page, view.cursor, load]);
  useEffect(() => { if (current.current.open && current.current.page?.live) void load(null); }, [load]);
  const toggle = () => {
    const open = !current.current.open; commit({ open });
    if (!open) { request.current?.abort(); setLoading(false); }
  };
  return { available: Boolean(source), ...view, error, loading, load, toggle };
}
