import { createContext, useContext } from "react";
export type Preview = { kind: "diagram"; source: string } | { kind: "file"; path: string; image?: boolean };
export const PreviewContext = createContext<((preview: Preview) => void) | null>(null);
export const usePreview = () => useContext(PreviewContext);
