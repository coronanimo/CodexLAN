export type PreferencesState = {
  sendShortcut: "enter" | "ctrl-enter"; completionNotifications: boolean; defaultModel: string;
  sidebarView: "projects" | "recent"; sidebarOrder: "original" | "recent"; project: string;
};
const keys: Record<keyof PreferencesState, string> = { sendShortcut: "send-shortcut", completionNotifications: "completion-notifications", defaultModel: "default-model", sidebarView: "sidebar-view", sidebarOrder: "sidebar-order", project: "project" };
export class Preferences {
  private state: PreferencesState;
  private listeners = new Set<() => void>();
  constructor(readonly userId = "anonymous") {
    const read = (key: keyof PreferencesState) => { try { return localStorage.getItem(this.key(key)); } catch { return null; } };
    this.state = { sendShortcut: read("sendShortcut") === "ctrl-enter" ? "ctrl-enter" : "enter", completionNotifications: read("completionNotifications") === "true", defaultModel: read("defaultModel") || "",
      sidebarView: read("sidebarView") === "recent" ? "recent" : "projects", sidebarOrder: read("sidebarOrder") === "recent" ? "recent" : "original", project: read("project") || "" };
  }
  private key(key: keyof PreferencesState) { return `codex-workspace-${keys[key]}:${this.userId}`; }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set<K extends keyof PreferencesState>(key: K, value: PreferencesState[K]) {
    this.state = { ...this.state, [key]: value };
    try { localStorage.setItem(this.key(key), String(value)); } catch {}
    for (const listener of this.listeners) listener();
  }
}
const users = new Map<string, Preferences>();
export function preferencesFor(userId = "anonymous") {
  if (!users.has(userId)) users.set(userId, new Preferences(userId));
  return users.get(userId)!;
}
