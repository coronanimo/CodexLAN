// Preserve the original document's diagram theme in both inline and full views.
export const mermaidOptions = {
  startOnLoad: false, securityLevel: "strict" as const, suppressErrorRendering: true,
  maxTextSize: 4000, maxEdges: 200, theme: "default" as const, look: "classic" as const,
  darkMode: false, flowchart: { useMaxWidth: false, htmlLabels: true, curve: "linear" as const },
  themeVariables: { fontSize: "16px", fontFamily: "Segoe UI, Microsoft YaHei UI, sans-serif" },
};
