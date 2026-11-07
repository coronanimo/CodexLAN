import { useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import { useAppSelector } from "../../../app/hooks";
import { TimelineRow } from "./TimelineRow";

const EMPTY_IDS: string[] = [];
const itemKey = (_index: number, id: string) => id;
const initialLocation = { index: "LAST" as const, align: "end" as const };

export function ConversationTimeline({ conversationId }: { conversationId: string }) {
  const ids = useAppSelector((state) => state.conversation.timelines[conversationId]?.ids || EMPTY_IDS);
  const firstItemIndex = useAppSelector((state) => state.conversation.timelines[conversationId]?.firstItemIndex || 1_000_000);
  const needsSnapshot = useAppSelector((state) => state.conversation.timelines[conversationId]?.needsSnapshot || false);
  const renderItem = useCallback((_index: number, id: string) => <TimelineRow id={id} />, []);

  return (
    <section className="timeline-panel" aria-label="对话记录">
      {needsSnapshot && <p role="status">记录顺序需要重新同步。</p>}
      <Virtuoso
        key={conversationId}
        data={ids}
        firstItemIndex={firstItemIndex}
        computeItemKey={itemKey}
        itemContent={renderItem}
        defaultItemHeight={44}
        initialTopMostItemIndex={initialLocation}
        followOutput="auto"
        increaseViewportBy={{ top: 300, bottom: 300 }}
      />
    </section>
  );
}
