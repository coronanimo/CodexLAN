import { useState } from "react";
import { codexlan } from "@products/codexlan/manifest";
import { Workbench } from "../app/Workbench";
import { useAppDispatch } from "../app/hooks";
import { orderedRowsPrepended, rowsCommitted } from "../features/conversation/model/conversationSlice";
import { rowKey } from "../features/conversation/model/types";

export function Preview() {
  const [conversationId, setThreadId] = useState("fixture-a");
  const [updates, setUpdates] = useState(0);
  const dispatch = useAppDispatch();
  const update = () => {
    const next = updates + 1;
    setUpdates(next);
    dispatch(rowsCommitted({ conversationId, rows: [{
      id: rowKey(conversationId, "fixture-turn", "answer"), conversationId, runId: "fixture-turn", kind: "assistant",
      text: `已完成项目检查。\n\n这是第 **${next}** 次局部内容更新。\n\n${"补充一段执行说明。\n\n".repeat(Math.min(next, 20))}`,
    }] }));
  };
  return <Workbench conversationId={conversationId} header={<>
    <h1>{codexlan.displayName} · React 对话预览</h1>
    <div className="preview-controls">
      <button onClick={update}>更新当前回复</button>
      <button onClick={() => dispatch(orderedRowsPrepended({ conversationId, rows: [{
        id: rowKey(conversationId, "older-turn", "user"), conversationId, runId: "older-turn", kind: "user", text: "这是更早的一条消息。",
      }] }))}>插入更早记录</button>
      <button onClick={() => setThreadId((current) => current === "fixture-a" ? "fixture-b" : "fixture-a")}>切换对话</button>
    </div>
  </>} />;
}
