import { useState } from "react";
import type { User } from "@lan/workspace";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import { workspaceClient } from "../../transport/workspace-client";
import { useManagement } from "../../app/controllers/useManagement";

export function AccountMenu({ user, onUser, onLogout }: { user: User; onUser(user: User): void; onLogout(): void }) {
  const [panel, setPanel] = useState<"profile" | "password" | "users" | null>(null), [error, setError] = useState("");
  const logout = async () => { try { await workspaceClient.logout(); onLogout(); } catch (error) { setError(error instanceof Error ? error.message : "退出失败。"); } };
  return <details className="account-menu"><summary>{user.displayName || user.username}</summary><div className="preview-controls">
    <button onClick={() => setPanel("profile")}>显示名称</button><button onClick={() => setPanel("password")}>修改密码</button>
    {user.role === "admin" && <button onClick={() => setPanel("users")}>账号管理</button>}
    {window.CodexAndroid && <button onClick={() => window.CodexAndroid?.openConnectionSettings()}>连接地址</button>}
    <button onClick={() => void logout()}>退出登录</button>
  </div>{error && <p role="alert">{error}</p>}
    {panel === "profile" && <Modal title="显示名称" onClose={() => setPanel(null)}><MutationForm
      submit={async ({ displayName = "" }) => onUser((await workspaceClient.profile(displayName)).user)} onSuccess={() => setPanel(null)}>
      <label>显示名称<input name="displayName" defaultValue={user.displayName} required /></label>
    </MutationForm></Modal>}
    {(panel === "password" || user.mustChangePassword) && <Modal title="修改密码" required={user.mustChangePassword} onClose={() => setPanel(null)}>
      <MutationForm submit={async ({ current = "", password = "", confirmation = "" }) => {
        if (password !== confirmation) throw new Error("两次输入的密码不一致。");
        await workspaceClient.password(current, password); onUser((await workspaceClient.session()).user);
      }} onSuccess={() => setPanel(null)}>
        <label>当前密码<input name="current" type="password" autoComplete="current-password" required /></label>
        <label>新密码<input name="password" type="password" autoComplete="new-password" required /></label>
        <label>确认新密码<input name="confirmation" type="password" autoComplete="new-password" required /></label>
      </MutationForm>
    </Modal>}
    {panel === "users" && <UserManager currentUser={user} onClose={() => setPanel(null)} />}
  </details>;
}

function UserManager({ currentUser, onClose }: { currentUser: User; onClose(): void }) {
  const management = useManagement("users");
  const [editing, setEditing] = useState<User | "new" | null>(null), [error, setError] = useState("");
  const toggle = async (user: User) => {
    try { await management.api.updateUser(user.id, { active: !user.active }); management.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "更新失败。"); }
  };
  return <Modal title="账号管理" onClose={onClose}>
    {(error || management.error) && <p role="alert">{error || management.error}</p>}
    <button onClick={() => setEditing("new")}>新建账号</button>
    {editing && <MutationForm key={typeof editing === "string" ? editing : editing.id} onSuccess={() => { setEditing(null); management.refresh(); }}
      submit={(values) => editing === "new" ? management.api.createUser(values) : management.api.resetPassword(editing.id, values.password || "")}>
      {editing === "new" && <><label>账号<input name="username" autoComplete="off" required /></label><label>显示名称<input name="displayName" required /></label>
        <label>角色<select name="role"><option value="member">普通成员</option><option value="admin">管理员</option></select></label></>}
      <label>{editing === "new" ? "初始密码" : "重置密码"}<input name="password" type="password" autoComplete="new-password" required /></label>
      <button type="button" onClick={() => setEditing(null)}>取消</button>
    </MutationForm>}
    <ul className="management-list">{management.users.map((user) => <li key={user.id}><strong>{user.displayName || user.username}</strong><small>{user.username} · {user.role === "admin" ? "管理员" : "成员"} · {user.active ? "已启用" : "已停用"}</small>
      <div className="preview-controls"><button onClick={() => setEditing(user)}>重置密码</button>{user.id !== currentUser.id && <button onClick={() => void toggle(user)}>{user.active ? "停用" : "启用"}</button>}</div>
    </li>)}</ul>
  </Modal>;
}
