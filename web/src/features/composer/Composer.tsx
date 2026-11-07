import { useState } from "react";

// Drafts survive thread switches; keystrokes stay local to this component.
// The app owns this small UI cache, independently of server conversation data.
export function Composer({ conversationId, drafts }: { conversationId: string; drafts: Map<string, string> }) {
  const [text, setText] = useState(() => drafts.get(conversationId) || "");
  return (
    <section className="composer-zone" aria-label="消息草稿">
      <label htmlFor="draft">草稿</label>
      <textarea
        id="draft"
        rows={3}
        value={text}
        placeholder="在这里输入，检查长对话下的输入响应…"
        onChange={(event) => {
          const value = event.target.value;
          drafts.set(conversationId, value);
          setText(value);
        }}
      />
      <small>迁移预览：草稿保留在当前页面，不会发送任务。</small>
    </section>
  );
}
