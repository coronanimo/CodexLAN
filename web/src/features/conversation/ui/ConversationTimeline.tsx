import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { useAppSelector } from "../../../app/hooks";
import { TimelineRow } from "./TimelineRow";
import { PendingRequests } from "../../controls/ControlsPanel";
import { useConversationUI } from "./ConversationUIContext";
import { ConversationDate } from "./ConversationDate";

const EMPTY_IDS: string[] = [];
const itemKey = (_index: number, id: string) => id;
const initialLocation = { index: "LAST" as const, align: "end" as const };

type History = { before: string | null; loading: boolean; error?: string; paused?: boolean; older(): void; refresh(): void };
function HistoryHeader({ context }: { context?: { history?: History; loadOlder(): void } }) { return <div className="timeline-history-header">{context?.history?.before && <button className="history-loader" disabled={context.history.loading} onClick={context.loadOlder}>{context.history.loading ? "正在加载…" : "加载更早消息"}</button>}</div>; }
function HistoryFooter() { return <div className="timeline-history-footer" aria-hidden="true" />; }
const components = { Header: HistoryHeader, Footer: HistoryFooter };
export const ConversationTimeline = memo(function ConversationTimeline({ conversationId, history }: { conversationId: string; history?: History }) {
  const ui = useConversationUI(), list = useRef<VirtuosoHandle>(null), [atBottom, setAtBottom] = useState(true);
  const following = useRef(true), alignmentFrame = useRef(0);
  const resumeAtBottom = useRef(true), touchY = useRef(0);
  const ids = useAppSelector((state) => state.conversation.timelines[conversationId]?.ids || EMPTY_IDS);
  const firstItemIndex = useAppSelector((state) => state.conversation.timelines[conversationId]?.firstItemIndex || 1_000_000);
  const needsSnapshot = useAppSelector((state) => state.conversation.timelines[conversationId]?.needsSnapshot || false);
  const viewportRevision = useAppSelector((state) => state.conversation.timelines[conversationId]?.viewportRevision || 0);
  const renderItem = useCallback((_index: number, id: string) => <div className="timeline-item"><ConversationDate id={id} /><TimelineRow id={id} /></div>, []);
  useEffect(() => { if (ui.latestRequest) { following.current = true; resumeAtBottom.current = true; list.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" }); } }, [ui.latestRequest]);
  useEffect(() => () => cancelAnimationFrame(alignmentFrame.current), []);
  const alignLatest = useCallback(() => {
    cancelAnimationFrame(alignmentFrame.current);
    if (following.current) alignmentFrame.current = requestAnimationFrame(() => { if (following.current) list.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" }); });
  }, []);
  const loadOlder = useCallback(() => {
    if (!history?.before || history.loading) return;
    following.current = false; resumeAtBottom.current = false;
    history.older();
  }, [history]);

  return (
    <section className="conversation-stage timeline-panel" aria-label="对话记录"
      onClickCapture={(event) => { if (event.target instanceof Element && event.target.closest('.execution-summary')) { following.current = false; resumeAtBottom.current = false; } }}
      onWheelCapture={(event) => { if (!event.ctrlKey) { resumeAtBottom.current = event.deltaY > 0; if (event.deltaY < 0) following.current = false; else if (atBottom) following.current = true; } }}
      onTouchStartCapture={(event) => { touchY.current = event.touches[0]?.clientY || 0; }}
      onTouchMoveCapture={(event) => { const next = event.touches[0]?.clientY ?? touchY.current; resumeAtBottom.current = next < touchY.current; touchY.current = next; following.current = false; }}
      onPointerDownCapture={(event) => { if (event.target instanceof HTMLElement && event.target.hasAttribute("data-virtuoso-scroller")) { following.current = false; resumeAtBottom.current = true; } }}
      onKeyDownCapture={(event) => { if (["ArrowUp", "PageUp", "Home"].includes(event.key)) { following.current = false; resumeAtBottom.current = false; } else if (["ArrowDown", "PageDown", "End"].includes(event.key)) resumeAtBottom.current = true; }}>
      <PendingRequests conversationId={conversationId} />
      {needsSnapshot && <p role="status">记录顺序需要重新同步。</p>}
      {history?.paused && <p role="status">本页记录已暂停更新，草稿已保留。</p>}
      {!ids.length && !history?.loading && <div className="conversation"><div className="empty-state"><span className="empty-orbit">✦</span><b>开始这个项目的聊天</b><p>在下方选择模型，然后输入第一条任务。</p></div></div>}
      {(ids.length > 0 || history?.loading) && <Virtuoso
        ref={list}
        components={components}
        context={{ history, loadOlder }}
        key={`${conversationId}:${viewportRevision}`}
        data={ids}
        firstItemIndex={firstItemIndex}
        computeItemKey={itemKey}
        itemContent={renderItem}
        defaultItemHeight={44}
        initialTopMostItemIndex={initialLocation}
        startReached={() => { if (!history?.error) loadOlder(); }}
        followOutput="auto"
        atBottomThreshold={72}
        atBottomStateChange={(value) => { setAtBottom(value); if (value && resumeAtBottom.current) following.current = true; }}
        totalListHeightChanged={alignLatest}
        increaseViewportBy={{ top: 300, bottom: 300 }}
      />}
      {(!atBottom || history?.paused) && ids.length > 0 && <button className="jump-latest" onClick={() => { history?.refresh(); ui.requestLatest(); }}>↓ 回到最新</button>}
    </section>
  );
});
