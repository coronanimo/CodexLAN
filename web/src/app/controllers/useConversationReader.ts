import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "react-redux";
import type { ConversationSelection, HistoryPage, ReadClient } from "@lan/read-api";
import type { AppStore } from "../store";
import { ConversationReader } from "./ConversationReader";

export function useConversationReader(client: ReadClient, selection: ConversationSelection | null) {
  const store = useStore.withTypes<AppStore>()();
  const [connection, setConnection] = useState("");
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState({ loading: false, error: "", before: null as string | null });
  const [controlsState, setControlsState] = useState({ loading: false, error: "" });
  const selectionEpoch = useRef(0);
  const reader = useMemo(() => new ConversationReader(client, store, (page, message, paused) => {
    setConnection(message);
    if (paused !== undefined) setPaused(paused);
    if (page) setState({ loading: false, error: "", before: page.before });
  }, setControlsState), [client, store]);
  const accept = (page: HistoryPage | null) => {
    if (page) setState({ loading: false, error: "", before: page.before });
  };
  useEffect(() => {
    selectionEpoch.current++;
    setPaused(false);
    if (!selection) {
      setState({ loading: false, error: "", before: null });
      return;
    }
    let active = true;
    setControlsState({ loading: !!client.controls, error: "" });
    setState({ loading: true, error: "", before: null });
    reader.open(selection).then((page) => { if (active) accept(page); }).catch((error: Error) => {
      if (active) setState({ loading: false, error: error.message, before: null });
    });
    return () => { active = false; selectionEpoch.current++; reader.close(); };
  }, [reader, selection]);
  const load = async (older: boolean) => {
    const epoch = selectionEpoch.current;
    setState((value) => ({ ...value, loading: true, error: "" }));
    try {
      const page = await (older ? reader.older() : reader.refresh());
      if (epoch !== selectionEpoch.current) return;
      if (page) accept(page); else setState((value) => ({ ...value, loading: false }));
    }
    catch (error) { if (epoch === selectionEpoch.current) setState((value) => ({ ...value, loading: false, error: error instanceof Error ? error.message : "读取失败。" })); }
  };
  return { ...state, connection, paused, controlsState, refreshControls: reader.refreshControls, refresh: () => void load(false), older: () => void load(true) };
}
