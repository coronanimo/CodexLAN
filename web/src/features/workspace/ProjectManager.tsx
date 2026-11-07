import { useState } from "react";
import type { User, Project } from "@lan/workspace";
import { Modal } from "../../components/Modal";
import { MutationForm } from "../../components/MutationForm";
import { useManagement, useProjectMembers } from "../../app/controllers/useManagement";

export function ProjectManager({ user, onClose, onChanged }: { user: User; onClose(): void; onChanged(): void }) {
  const management = useManagement("projects");
  const [editing, setEditing] = useState<Project | "new" | null>(null), [sharing, setSharing] = useState<Project | null>(null), [error, setError] = useState("");
  const changed = () => { setEditing(null); management.refresh(); onChanged(); };
  const remove = async (project: Project) => {
    if (!window.confirm(`删除“${project.name}”的项目登记及会话绑定？项目文件会保留。`)) return;
    try { await management.api.removeProject(project.id); changed(); }
    catch (error) { setError(error instanceof Error ? error.message : "删除失败。"); }
  };
  return <Modal title="项目管理" onClose={onClose}>
    {(error || management.error) && <p role="alert">{error || management.error}</p>}
    <button onClick={() => setEditing("new")}>新建项目</button>
    {editing && <MutationForm key={typeof editing === "string" ? editing : editing.id} label={editing === "new" ? "创建" : "保存"} onSuccess={changed}
      submit={({ name = "", path = "" }) => editing === "new" ? management.api.createProject({ name, ...(path ? { path } : {}) }) : management.api.updateProject(editing.id, { name, ...(user.role === "admin" ? { path } : {}) })}>
      <label>项目名称<input name="name" defaultValue={editing === "new" ? "" : editing.name} required /></label>
      {user.role === "admin" && <label>项目目录<input name="path" defaultValue={editing === "new" ? "" : editing.path} placeholder="留空使用默认目录" /></label>}
      <button type="button" onClick={() => setEditing(null)}>取消</button>
    </MutationForm>}
    <ul className="management-list">{management.projects.map((project) => <li key={project.id}>
      <strong>{project.name}</strong><small>{project.path}{!project.available && " · 目录不可用"}</small>
      {(user.role === "admin" || project.ownerId === user.id) && <div className="preview-controls">
        <button onClick={() => setEditing(project)}>编辑</button><button onClick={() => setSharing(project)}>共享权限</button><button onClick={() => void remove(project)}>删除登记</button>
      </div>}
    </li>)}</ul>
    {sharing && <ProjectSharing project={sharing} onClose={() => setSharing(null)} onChanged={onChanged} />}
  </Modal>;
}

function ProjectSharing({ project, onClose, onChanged }: { project: Project; onClose(): void; onChanged(): void }) {
  const access = useProjectMembers(project.id);
  return <Modal title={`共享 · ${project.name}`} onClose={onClose}>
    {access.error && <p role="alert">{access.error}</p>}
    <MutationForm submit={(_, data) => access.save(data.getAll("member").map(String))} onSuccess={() => { onChanged(); onClose(); }}>
      {access.members.map((member) => <label key={member.id}><input type="checkbox" name="member" value={member.id} defaultChecked={member.granted} />{member.displayName || member.username}</label>)}
    </MutationForm>
  </Modal>;
}
