import { createContext, useContext } from "react";
import type { ConversationCommand } from "@lan/commands";
import type { AgentCapabilities } from "@lan/agent-contract";
import type { ConversationSelection } from "@lan/read-api";
import type { Attachments } from "./controllers/Attachments";

export type ActionPort = {
  conversationId: string;
  execute(command: ConversationCommand): Promise<{ name?: string }>;
  queuedText(itemId: string): Promise<string>;
  drafts: Map<string, string>;
  capabilities: AgentCapabilities;
  selection: ConversationSelection;
  attachments: Attachments;
};
export const ActionContext = createContext<ActionPort | null>(null);
export const useActions = () => useContext(ActionContext);
