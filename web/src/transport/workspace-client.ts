import type { Project, User } from "@lan/workspace";
import { authenticate, readJson, sendJson } from "./http";

export const workspaceClient = {
  session: () => readJson<{ user: User; csrfToken: string }>("/api/auth/session"),
  login: (values: Record<string, string>) => authenticate("/api/auth/login", values),
  setup: (values: Record<string, string>) => authenticate("/api/auth/setup", values),
  logout: () => sendJson("/api/auth/logout", {}),
  profile: (displayName: string) => sendJson<{ user: User }>("/api/auth/profile", { displayName }, "PATCH"),
  password: (currentPassword: string, newPassword: string) => sendJson("/api/auth/password", { currentPassword, newPassword }),
  users: async () => (await readJson<{ users: User[] }>("/api/users")).users,
  createUser: (values: Record<string, string>) => sendJson("/api/users", values),
  updateUser: (id: string, values: Partial<User>) => sendJson(`/api/users/${encodeURIComponent(id)}`, values, "PATCH"),
  resetPassword: (id: string, password: string) => sendJson(`/api/users/${encodeURIComponent(id)}/password`, { password }),
  projects: async () => (await readJson<{ projects: Project[] }>("/api/projects")).projects,
  createProject: (values: { name: string; path?: string }) => sendJson("/api/projects", values),
  updateProject: (id: string, values: { name?: string; path?: string }) => sendJson(`/api/projects/${encodeURIComponent(id)}`, values, "PATCH"),
  removeProject: (id: string) => sendJson(`/api/projects/${encodeURIComponent(id)}`, undefined, "DELETE"),
  members: async (id: string) => (await readJson<{ members: (User & { granted: boolean })[] }>(`/api/projects/${encodeURIComponent(id)}/members`)).members,
  setMembers: (id: string, memberIds: string[]) => sendJson(`/api/projects/${encodeURIComponent(id)}/members`, { memberIds }, "PUT"),
};
