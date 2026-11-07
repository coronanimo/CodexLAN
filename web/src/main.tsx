import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createAppStore } from "./app/store";
import { App } from "./app/App";
import "./app/styles.css";

const store = createAppStore();
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<StrictMode><Provider store={store}><App /></Provider></StrictMode>);
