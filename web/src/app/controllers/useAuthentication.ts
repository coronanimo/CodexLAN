import { useEffect, useState } from "react";
import { workspaceClient } from "../../transport/workspace-client";
import { HttpError } from "../../transport/http";

export function useAuthentication(onSuccess: () => void) {
  const [setup, setSetup] = useState(false), [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    workspaceClient.session().then(() => { if (active) onSuccess(); }).catch((error) => {
      if (!active) return;
      if (error instanceof HttpError && error.status === 401) setSetup(error.details?.setupRequired === true);
      else setError(error instanceof Error ? error.message : "连接失败。");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  const submit = async (values: Record<string, string>) => {
    if (pending) return;
    setPending(true); setError("");
    try { await (setup ? workspaceClient.setup(values) : workspaceClient.login(values)); onSuccess(); }
    catch (error) { setError(error instanceof Error ? error.message : "登录失败。"); }
    finally { setPending(false); }
  };
  return { setup, checking, pending, error, submit };
}
