import { rowKey } from "../features/conversation/model/types";
import type { TimelineRow } from "../features/conversation/model/types";

export function createConversationFixture(conversationId: string, count = 2_000): TimelineRow[] {
  const runId = "fixture-turn";
  return [
    { id: rowKey(conversationId, runId, "user"), conversationId, runId, kind: "user", text: "请处理这个项目，并汇报结果。" },
    ...Array.from({ length: count }, (_, index): TimelineRow => ({
      id: rowKey(conversationId, runId, `command-${index}`), conversationId, runId, kind: "execution",
      label: "命令", title: `执行项目检查 ${index + 1}`, status: "completed",
    })),
    { id: rowKey(conversationId, runId, "answer"), conversationId, runId, kind: "assistant",
      text: "已完成项目检查。\n\n- 历史保留原始顺序\n- 可以向上查看执行过程\n\n后续输出会更新这条消息。" },
  ];
}
