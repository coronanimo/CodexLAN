import { useAppSelector } from "../../../app/hooks";
import type { TimelineRow } from "@lan/presentation";

function day(row?: TimelineRow) {
  const timestamp = row && (row.kind === "user" || row.kind === "assistant") ? row.timestamp : null;
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ConversationDate({ id }: { id: string }) {
  const value = useAppSelector((state) => {
    const row = state.conversation.entities[id], current = day(row);
    if (!row || !current) return "";
    const ids = state.conversation.timelines[row.conversationId]?.ids || [], index = ids.indexOf(id);
    for (let i = index - 1; i >= 0; i--) { const previous = day(state.conversation.entities[ids[i]!]); if (previous) return previous === current ? "" : current; }
    return current;
  });
  if (!value) return null;
  const date = new Date(value + "T00:00:00"), today = new Date(), yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const calendar = `${date.getMonth() + 1}月${date.getDate()}日`;
  const same = (other: Date) => date.toDateString() === other.toDateString();
  const label = same(today) ? `今天 · ${calendar}` : same(yesterday) ? `昨天 · ${calendar}` : date.getFullYear() === today.getFullYear() ? `${calendar} · ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}` : `${date.getFullYear()}年${calendar} · ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}`;
  return <div className="conversation-date"><time dateTime={value}>{label}</time></div>;
}
