export function localFileTarget(target: string): string | null;
export function fileNameFromPath(path: string): string;
export function textPreviewKind(name: string): "markdown" | "json" | "text" | "code" | null;
export function projectForLocalFile<T extends { id: string; path?: string }>(projects: T[], path: string): T | null;
export function localFileDownloadUrl(options: { projects: { id: string; path?: string }[]; projectId: string; role: string; path: string; name?: string }): string;
export function canonicalFilePath(value: string): string;
