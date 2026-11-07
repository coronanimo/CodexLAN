import { useRef } from "react";
import { Composer } from "../features/composer/Composer";
import { ConversationTimeline } from "../features/conversation/ui/ConversationTimeline";
import type { ReactNode } from "react";

export function Workbench({ conversationId, header }: { conversationId: string; header: ReactNode }) {
  const drafts = useRef(new Map<string, string>());
  return (
    <main className="react-workbench">
      <header className="workbench-header">{header}</header>
      <ConversationTimeline key={`timeline:${conversationId}`} conversationId={conversationId} />
      <Composer key={`composer:${conversationId}`} conversationId={conversationId} drafts={drafts.current} />
    </main>
  );
}
