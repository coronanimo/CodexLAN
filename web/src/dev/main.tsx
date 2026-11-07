import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { codexlan } from "@products/codexlan/manifest";
import { createAppStore } from "../app/store";
import { snapshotCommitted } from "../features/conversation/model/conversationSlice";
import { createConversationFixture } from "./fixtures";
import { Preview } from "./Preview";
import "../app/styles.css";

const store = createAppStore();
document.title = `${codexlan.displayName} · React 迁移预览`;
for (const conversationId of ["fixture-a", "fixture-b"]) {
  store.dispatch(snapshotCommitted({ conversationId, rows: createConversationFixture(conversationId) }));
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<StrictMode><Provider store={store}><Preview /></Provider></StrictMode>);
