import { createContext, useContext } from "react";
export type FileAccess = { projects: { id: string; path?: string }[]; role: string };
export const FileAccessContext = createContext<FileAccess>({ projects: [], role: "member" });
export const useFileAccess = () => useContext(FileAccessContext);
