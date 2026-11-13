import { useState } from "react";
import type { User, Project } from "@lan/workspace";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import { useManagement, useProjectMembers } from "../../app/controllers/useManagement";
import "./Management.css";
import { useConfirmation } from "../../components/useConfirmation";

export function ProjectManager({ user, selectedProjectId, workspaceRoot, providerName, onOpen, onClose, onChanged, initialNew = false }: { user: User; selectedProjectId: string; workspaceRoot?: string; providerName: string; onOpen(projectId: string): void; onClose(): void; onChanged(projectId?: string): void; initialNew?: boolean }) {
  const management = useManagement("projects"), confirmation = useConfirmation();
  const [editing, setEditing] = useState<Project | "new" | null>(initialNew ? "new" : null), [renaming, setRenaming] = useState<Project | null>(null), [sharing, setSharing] = useState<Project | null>(null), [error, setError] = useState("");
  const remove = async (project: Project) => {
    if (!await confirmation.confirm({ kicker: "删除项目记录", title: project.name, message: `只删除工作台中的项目记录；项目目录、项目文件和已有 ${providerName} 聊天不会被删除。`, confirmLabel: "删除项目记录" })) return;
    try { await management.api.removeProject(project.id); management.refresh(); onChanged(); if (editing) onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "删除失败。"); }
  };
  return <>{!editing && !renaming && <Modal kicker="项目管理" title="本机项目目录" className="project-manager-dialog" onClose={onClose}><div className="dialog-content">
    <p className="dialog-intro">项目记录只保存目录和执行配置。删除记录不会删除磁盘文件或 {providerName} 历史。</p>
    {(error || management.error) && <p className="form-error" role="alert">{error || management.error}</p>}
    <div className="project-manager-list">{management.projects.map((project) => <article className="project-manager-row" data-selected={project.id === selectedProjectId} key={project.id}>
      <div><strong>{project.name}</strong><code title={project.path}>{!project.available && "目录不可用 · "}{project.path}</code></div>
      <div className="project-manager-actions">
        <button className="quiet-button" onClick={() => { onOpen(project.id); onClose(); }}>{project.available ? "打开" : "查看"}</button>
        {(user.role === "admin" || project.ownerId === user.id) && <>
          <button className="quiet-button" onClick={() => setRenaming(project)}>改名</button>
          <button className="quiet-button" onClick={() => setEditing(project)}>编辑</button>
          <button className="quiet-button" onClick={() => setSharing(project)}>授权</button>
          <button className="quiet-button" disabled={management.projects.length < 2} onClick={() => void remove(project)}>删除</button>
        </>}
      </div>
    </article>)}</div>
    <div className="dialog-actions"><button className="primary-button" onClick={() => setEditing("new")}>新增项目</button><span /><button className="quiet-button" onClick={onClose}>完成</button></div>
  </div></Modal>}
    {editing && <Modal kicker={editing === "new" ? "新项目" : "项目设置"} title={editing === "new" ? "新建项目" : "编辑项目"} className="project-dialog" onClose={onClose}><MutationForm key={typeof editing === "string" ? editing : editing.id} label="保存项目" onCancel={onClose} message={error}
      secondaryAction={editing !== "new" && <button className="danger-button" type="button" disabled={management.projects.length < 2} onClick={() => void remove(editing)}>删除项目记录</button>}
      onSuccess={({ project }) => { onChanged(project.id); onClose(); }}
      submit={({ name = "", path = "" }) => editing === "new" ? management.api.createProject({ name, ...(user.role === "admin" && path ? { path } : {}) }) : management.api.updateProject(editing.id, { name, ...(user.role === "admin" ? { path } : {}) })}>
      <label>项目名称<input name="name" defaultValue={editing === "new" ? "" : editing.name} maxLength={80} autoFocus required /></label>
      <label>项目目录<input name="path" defaultValue={editing === "new" ? user.role === "admin" ? "" : `${workspaceRoot || "默认项目目录"}\\（按项目名称自动创建）` : editing.path} readOnly={user.role !== "admin"} aria-readonly={user.role !== "admin" || undefined} placeholder={user.role === "admin" ? "输入任意绝对目录；留空则按项目名称创建" : undefined} /></label>
    </MutationForm></Modal>}
    {renaming && <Modal kicker="项目管理" title="项目改名" className="thread-dialog project-rename-dialog" onClose={onClose}><MutationForm label="确认改名" onCancel={onClose} submit={({ name = "" }) => management.api.updateProject(renaming.id, { name })} onSuccess={({ project }) => { onChanged(project.id); onClose(); }}>
      <label>新名称<input name="name" defaultValue={renaming.name} maxLength={80} autoFocus onFocus={(event) => event.currentTarget.select()} required /></label>
    </MutationForm></Modal>}
    {sharing && <ProjectSharing project={sharing} onClose={() => setSharing(null)} onChanged={onChanged} />}
    {confirmation.dialog}
  </>;
}

function ProjectSharing({ project, onClose, onChanged }: { project: Project; onClose(): void; onChanged(): void }) {
  const access = useProjectMembers(project.id);
  return <Modal title={`${project.name} · 项目授权`} className="project-dialog" onClose={onClose} header={(titleId) => <div className="dialog-heading"><h2 id={titleId}>{project.name} · 项目授权</h2></div>}>
    <MutationForm label="保存授权" onCancel={onClose} message={access.error} submit={(_, data) => access.save(data.getAll("member").map(String).filter((id) => !access.members.find((member) => member.id === id)?.owner))} onSuccess={() => { onChanged(); onClose(); }}>
      <p>被授权账号可以访问和操作项目文件、该项目的聊天与队列。所有者负责管理项目和授权。</p>
      {access.members.map((member, index) => <label key={member.id}><input type="checkbox" name="member" value={member.id} defaultChecked={member.granted || member.owner} disabled={member.owner} autoFocus={index === access.members.findIndex((entry) => !entry.owner)} />{member.displayName || member.username} ({member.username}){member.owner ? " · 所有者" : ""}{member.active ? "" : " · 已停用"}</label>)}
    </MutationForm>
  </Modal>;
}
