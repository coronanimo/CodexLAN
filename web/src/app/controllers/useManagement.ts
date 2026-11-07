import { useCallback, useEffect, useState } from "react";
import type { Project, User } from "@lan/workspace";
import { workspaceClient } from "../../transport/workspace-client";

export function useManagement(kind: "projects" | "users") {
  const [projects, setProjects] = useState<Project[]>([]), [users, setUsers] = useState<User[]>([]), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const read = kind === "projects" ? workspaceClient.projects().then((values) => { if (active) setProjects(values); })
      : workspaceClient.users().then((values) => { if (active) setUsers(values); });
    read.catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [kind, revision]);
  const refresh = useCallback(() => { setError(""); setRevision((value) => value + 1); }, []);
  return { projects, users, error, refresh, api: workspaceClient };
}

export function useProjectMembers(projectId: string) {
  const [members, setMembers] = useState<(User & { granted: boolean })[]>([]), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setMembers([]); setError("");
    workspaceClient.members(projectId).then((value) => { if (active) setMembers(value); }).catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [projectId]);
  return { members, error, save: (ids: string[]) => workspaceClient.setMembers(projectId, ids) };
}
