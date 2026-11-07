import { useState } from "react";
import type { FormEvent } from "react";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "登录失败。");
      onSuccess();
    } catch (error) { setError(error instanceof Error ? error.message : "登录失败。"); }
    finally { setPending(false); }
  };
  return <main className="login-panel">
    <h1>登录工作台</h1><p>使用当前服务的账号。首次管理员初始化仍在原工作台完成。</p>
    <form onSubmit={(event) => void submit(event)}>
      <label>账号<input name="username" autoComplete="username" required /></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>{pending ? "正在登录…" : "登录"}</button>
    </form>
  </main>;
}
