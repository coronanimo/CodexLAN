import { useRef, useState } from "react";
import { Composer } from "../features/composer/Composer";
import { ConversationTimeline } from "../features/conversation/ui/ConversationTimeline";
import type { ReactNode } from "react";
import "./Workbench.css";
import { QueuePanel } from "../features/controls/QueuePanel";
import { ConversationUIContext } from "../features/conversation/ui/ConversationUIContext";

export function Workbench({ conversationId, header, drafts, controls, history }: { conversationId: string; header: ReactNode; drafts?: Map<string, string>; controls?: ReactNode; history?: { before: string | null; loading: boolean; paused?: boolean; older(): void; refresh(): void } }) {
  const localDrafts = useRef(new Map<string, string>());
  const [goalOpen, setGoalOpen] = useState(false), [latestRequest, setLatestRequest] = useState(0);
  return (
    <ConversationUIContext.Provider value={{ goalOpen, setGoalOpen, latestRequest, requestLatest: () => setLatestRequest((value) => value + 1) }}><main className="workbench">
      <header className="workbench-header">{header}</header>
      <ConversationTimeline key={`timeline:${conversationId}`} conversationId={conversationId} history={history} />
      <QueuePanel conversationId={conversationId} />
      <section className="composer-zone"><Composer key={`composer:${conversationId}`} conversationId={conversationId} drafts={drafts || localDrafts.current} toolbar={controls} /></section>
    </main></ConversationUIContext.Provider>
  );
}
