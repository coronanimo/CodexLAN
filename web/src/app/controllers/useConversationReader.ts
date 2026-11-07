import { useEffect, useMemo, useState } from "react";
import { useStore } from "react-redux";
import type { ConversationSelection, HistoryPage, ReadClient } from "@lan/read-api";
import type { AppStore } from "../store";
import { ConversationReader } from "./ConversationReader";

export function useConversationReader(client: ReadClient, selection: ConversationSelection | null) {
  const store = useStore.withTypes<AppStore>()();
  const reader = useMemo(() => new ConversationReader(client, store), [client, store]);
  const [state, setState] = useState({ loading: false, error: "", before: null as string | null });
  const accept = (page: HistoryPage | null) => {
    if (page) setState({ loading: false, error: "", before: page.before });
  };
  useEffect(() => {
    if (!selection) {
      setState({ loading: false, error: "", before: null });
      return;
    }
    let active = true;
    setState({ loading: true, error: "", before: null });
    reader.open(selection).then((page) => { if (active) accept(page); }).catch((error: Error) => {
      if (active) setState({ loading: false, error: error.message, before: null });
    });
    return () => { active = false; reader.close(); };
  }, [reader, selection]);
  const load = async (older: boolean) => {
    setState((value) => ({ ...value, loading: true, error: "" }));
    try { accept(await (older ? reader.older() : reader.refresh())); }
    catch (error) { setState((value) => ({ ...value, loading: false, error: error instanceof Error ? error.message : "读取失败。" })); }
  };
  return { ...state, refresh: () => void load(false), older: () => void load(true) };
}
