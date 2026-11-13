import { useState } from "react";
import type { User } from "@lan/workspace";
import type { ConversationControls } from "@lan/commands";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import { workspaceClient } from "../../transport/workspace-client";
import { useManagement } from "../../app/controllers/useManagement";
import { Dropdown } from "../../components/Dropdown";
import { Icon } from "../../components/Icon";
import { useConfirmation } from "../../components/useConfirmation";
import "./Management.css";

export type AccountPanel = "profile" | "password" | "users";
export function AccountMenu({ user, usage, onLogout, onSettings, onRefresh, onPanel }: { user: User; usage?: ConversationControls["usage"]; onLogout(): void; onSettings(): void; onRefresh(): void; onPanel(panel: AccountPanel): void }) {
  const [error, setError] = useState("");
  const logout = async () => { try { await workspaceClient.logout(); onLogout(); } catch (error) { setError(error instanceof Error ? error.message : "退出失败。"); } };
  const limits = usage?.limits.flatMap((limit) => limit.windows).filter((window) => window.minutes === 300 || window.minutes === 10080) || [];
  return <><Dropdown className="sidebar-account-wrap" triggerClassName="sidebar-account-button" panelClassName="account-menu" align="left" label="用户属性与账号菜单" trigger={<><span className="sidebar-account-avatar">{Array.from(user.displayName || user.username)[0]}</span><span className="sidebar-account-copy"><strong>{user.displayName || user.username}</strong><span className="sidebar-account-meta"><small>@{user.username}</small>{limits.length > 0 && <span className="sidebar-account-limits">{limits.map((window) => <span key={window.minutes}>{window.minutes === 300 ? "5H" : "周"} {Math.round(window.usedPercent || 0)}%</span>)}</span>}</span></span></>}>
    {limits.length > 0 && <section className="account-limit-details" aria-label="额度重置时间">{limits.map((window) => <div className="account-limit-detail" key={window.minutes}><span>{window.minutes === 300 ? "5 小时额度" : "每周额度"}</span><strong>已使用 {Math.round(window.usedPercent || 0)}%</strong><small>重置时间：{window.resetsAt ? new Date(window.resetsAt * 1000).toLocaleString() : "未知"}</small></div>)}</section>}
    <button className="quiet-button" onClick={onRefresh}><Icon name="refresh" /><span>刷新工作台</span></button>
    <button className="quiet-button" onClick={onSettings}><Icon name="settings" /><span>设置</span></button><div className="account-menu-divider" />
    {user.role === "admin" && <button className="quiet-button" onClick={() => onPanel("users")}><Icon name="users" /><span>管理成员账号</span></button>}
    <button className="quiet-button" onClick={() => onPanel("profile")}><Icon name="user" /><span>修改显示名称</span></button>
    <button className="quiet-button" onClick={() => onPanel("password")}><Icon name="lock" /><span>修改密码</span></button>
    <button className="quiet-button" onClick={() => void logout()}><Icon name="logout" /><span>退出登录</span></button>
  </Dropdown>{error && <p role="alert">{error}</p>}</>;
}

// Keep dialogs above the mobile drawer so opening one can close navigation.
export function AccountDialogs({ user, panel, providerName, onUser, onClose }: { user: User; panel: AccountPanel | null; providerName: string; onUser(user: User): void; onClose(): void }) {
  return <>
    {panel === "profile" && <Modal kicker="个人资料" title="修改显示名称" className="thread-dialog display-name-dialog" onClose={onClose}><MutationForm label="保存名称" onCancel={onClose}
      submit={async ({ displayName = "" }) => onUser((await workspaceClient.profile(displayName)).user)} onSuccess={onClose}>
      <p className="dialog-intro">登录用户名不会改变。</p>
      <label>显示名称<input name="displayName" defaultValue={user.displayName} autoComplete="name" maxLength={40} autoFocus onFocus={(event) => event.currentTarget.select()} required /></label>
    </MutationForm></Modal>}
    {(panel === "password" || user.mustChangePassword) && <Modal kicker="账号安全" title="修改我的密码" className="thread-dialog password-dialog" required={user.mustChangePassword} onClose={onClose}>
      <MutationForm label="保存新密码" onCancel={user.mustChangePassword ? undefined : onClose} submit={async ({ current = "", password = "", confirmation = "" }) => {
        if (password !== confirmation) throw new Error("两次输入的密码不一致。");
        await workspaceClient.password(current, password); onUser((await workspaceClient.session()).user);
      }} onSuccess={onClose}>
        <p className="dialog-intro">{user.mustChangePassword ? "管理员为你设置了临时密码。请先换成只有你知道的新密码。" : "修改后，其他设备上的登录会立即失效。"}</p>
        <label>当前密码<input name="current" type="password" autoComplete="current-password" autoFocus required /></label>
        <label>新密码<input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
        <label>确认新密码<input name="confirmation" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
      </MutationForm>
    </Modal>}
    {panel === "users" && <UserManager currentUser={user} providerName={providerName} onClose={onClose} />}
  </>;
}

function UserManager({ currentUser, providerName, onClose }: { currentUser: User; providerName: string; onClose(): void }) {
  const confirmation = useConfirmation(), management = useManagement("users");
  const [editing, setEditing] = useState<User | "new" | null>(null), [error, setError] = useState("");
  const toggle = async (user: User) => {
    if (!await confirmation.confirm({ kicker: "成员账号", title: `${user.active ? "停用" : "启用"}${user.displayName}`, message: user.active ? "这个账号会立即退出，已有项目和聊天不会删除。" : "这个账号将可以重新登录。", confirmLabel: user.active ? "停用" : "启用" })) return;
    try { await management.api.updateUser(user.id, { active: !user.active }); management.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "更新失败。"); }
  };
  return <><Modal kicker="成员账号" title="谁可以使用工作台" className="project-manager-dialog user-manager-dialog" onClose={onClose}><div className="dialog-content">
    <p className="dialog-intro">每个人拥有独立的项目列表、聊天、队列和设置。底层仍共用这台 Windows 的 {providerName} 与文件权限。</p>
    {(error || management.error) && <p className="form-error" role="alert">{error || management.error}</p>}
    <div className="user-list">{management.users.map((user) => <article className={`user-row${user.active ? "" : " inactive"}`} key={user.id}>
      <span className="user-avatar">{Array.from(user.displayName || user.username)[0]}</span><div className="user-copy"><strong>{user.displayName || user.username}{user.role === "admin" && <i className="user-role">管理员</i>}</strong><small>@{user.username}{user.mustChangePassword ? " · 待修改临时密码" : ""}</small></div>
      <div className="user-actions"><button className="quiet-button" disabled={user.id === currentUser.id} onClick={() => setEditing(user)}>重设密码</button><button className={user.active ? "danger-button" : "quiet-button"} disabled={user.id === currentUser.id} onClick={() => void toggle(user)}>{user.active ? "停用" : "启用"}</button></div>
    </article>)}</div>
    <div className="dialog-actions"><button className="primary-button" onClick={() => setEditing("new")}>新增成员账号</button><span /><button className="quiet-button" onClick={onClose}>完成</button></div>
  </div></Modal>
    {editing && <Modal kicker="成员账号" title={editing === "new" ? "新增账号" : `重设 ${editing.displayName} 的密码`} className="thread-dialog user-dialog" onClose={() => setEditing(null)}><MutationForm key={typeof editing === "string" ? editing : editing.id} label="保存账号" onCancel={() => setEditing(null)} onSuccess={() => { setEditing(null); management.refresh(); }}
      submit={(values) => { if (values.password !== values.confirmation) throw new Error("两次输入的临时密码不一致。"); return editing === "new" ? management.api.createUser(values) : management.api.resetPassword(editing.id, values.password || ""); }}>
      {editing === "new" && <div id="new-user-fields"><label>用户名<input name="username" autoComplete="off" autoCapitalize="none" minLength={2} maxLength={32} autoFocus required /></label><label>显示名称<input name="displayName" maxLength={40} required /></label></div>}
      <label>临时密码<input name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} autoFocus={editing !== "new"} required /></label>
      <label>确认临时密码<input name="confirmation" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>
      <p className="config-note">对方第一次登录后会被要求修改密码。</p>
    </MutationForm></Modal>}
    {confirmation.dialog}
  </>;
}
