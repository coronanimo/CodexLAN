import { createContext, useContext } from "react";
export type Preview = { kind: "diagram"; source: string; svg?: string }
  | { kind: "attachment"; id: string; file: File }
  | { kind: "file"; path: string; image?: boolean }
  | { kind: "diff"; detailId: string; title: string }
  | { kind: "visualization"; path: string; title: string; mode?: "wide" | "standard" };
export const PreviewContext = createContext<((preview: Preview) => void) | null>(null);
export const usePreview = () => useContext(PreviewContext);
