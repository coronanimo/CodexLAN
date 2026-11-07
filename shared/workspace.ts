export type User = { id: string; username: string; displayName: string; role: "admin" | "member"; active: boolean; mustChangePassword: boolean };
export type Project = { id: string; name: string; available: boolean; path?: string; ownerId?: string; settings?: Record<string, string> };
export type UploadedFile = { id: string; name: string; size: number };
