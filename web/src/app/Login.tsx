import type { FormEvent } from "react";
import { useAuthentication } from "./controllers/useAuthentication";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const auth = useAuthentication(onSuccess);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await auth.submit(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
  };
  return <main className="login-panel">
    <h1>{auth.setup ? "设置管理员" : "登录工作台"}</h1>
    {auth.setup && <p>首次设置请在运行服务的电脑上完成。</p>}
    <form onSubmit={(event) => void submit(event)}>
      <label>账号<input name="username" autoComplete="username" required /></label>
      {auth.setup && <label>显示名称<input name="displayName" autoComplete="nickname" required /></label>}
      <label>密码<input name="password" type="password" autoComplete={auth.setup ? "new-password" : "current-password"} required /></label>
      {auth.error && <p role="alert">{auth.error}</p>}
      <button disabled={auth.pending || auth.checking}>{auth.pending ? "正在处理…" : auth.setup ? "创建管理员" : "登录"}</button>
    </form>
  </main>;
}
