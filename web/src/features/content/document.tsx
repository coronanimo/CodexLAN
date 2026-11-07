import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderBudget } from "./render-budget";

export function markdownDocument(title: string, markdown: string) {
  return "<!doctype html>" + renderToStaticMarkup(<html><head><meta charSet="utf-8" /><title>{title}</title><style>{"body{font:16px system-ui;max-width:900px;margin:32px auto;padding:16px;overflow-wrap:anywhere}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:5px}"}</style></head>
    <body><h1>{title}</h1><Markdown remarkPlugins={[remarkGfm, [renderBudget, { preserveText: true }]]}>{markdown}</Markdown></body></html>);
}
