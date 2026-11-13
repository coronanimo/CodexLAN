import type { FormEvent } from "react";
import { useAuthentication } from "./controllers/useAuthentication";
import "./Login.css";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const auth = useAuthentication(onSuccess);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await auth.submit(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
  };
  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-identity" aria-hidden="true"><span>C</span><i /><span>你</span></div>
    <div className="auth-heading"><span>{auth.setup ? "首次初始化" : "个人工作区"}</span><h1>{auth.setup ? "创建管理员账号" : `登录 ${document.title}`}</h1>
    <p>{auth.setup ? "创建这个服务的管理员账号。首次设置只能在服务器电脑上完成。" : "访问你的项目和获授权的共享项目。"}</p></div>
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      {auth.setup ? <div className="auth-field-row"><label>用户名<input name="username" autoComplete="username" autoCapitalize="none" minLength={2} maxLength={32} autoFocus required /></label><label>显示名称<input name="displayName" autoComplete="name" maxLength={40} required /></label></div> : <label>用户名<input name="username" autoComplete="username" autoCapitalize="none" autoFocus required /></label>}
      <label>{auth.setup ? "管理员密码" : "密码"}<input name="password" type="password" autoComplete={auth.setup ? "new-password" : "current-password"} minLength={auth.setup ? 6 : undefined} maxLength={auth.setup ? 128 : undefined} required /></label>
      {auth.setup && <label>确认密码<input name="confirmation" type="password" autoComplete="new-password" minLength={6} maxLength={128} required /></label>}
      <p className="form-error" role={auth.error ? "alert" : undefined}>{auth.error}</p>
      <button className="primary-button auth-submit" disabled={auth.pending || auth.checking}>{auth.pending ? "正在处理…" : auth.setup ? "创建管理员" : "进入我的工作区"}</button>
    </form>
    <footer className="auth-footnote"><span className="status-dot" /><span>账号只保存在运行服务的电脑上</span></footer>
  </section></main>;
}
