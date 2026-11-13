import { useState } from "react";
import type { AgentSetting } from "@lan/agent-contract";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";
import { usePreferences } from "../../app/PreferencesContext";
import { Modal } from "../../components/Modal";
import { SettingControl } from "../controls/SettingControl";
import { copyText } from "../../platform/android";
import "./GlobalSettings.css";

export function GlobalSettings({ fields, title, productName, connection, onClose }: { fields: AgentSetting[]; title: string; productName: string; connection: string; onClose(): void }) {
  const pref = usePreferences(), actions = useActions(), controls = useAppSelector((state) => actions ? state.controls[actions.conversationId] : undefined);
  const model = fields.find((field) => field.role === "model" && field.kind === "choice");
  const [copied, setCopied] = useState(false), [notificationPermission, setNotificationPermission] = useState("Notification" in window ? Notification.permission : "denied");
  return <Modal kicker={productName} title="设置" className="settings-dialog global-config-dialog" onClose={onClose}>
    <section className="settings-section"><div className="settings-section-heading"><div><strong>连接</strong><p>当前浏览器正在访问的 {productName} 服务。</p></div><span className="settings-connection-state"><small className="status-dot settings-status-dot" /><strong>{connection || "正在连接"}</strong></span></div>
      <div className="settings-address-row"><code>{location.origin}</code><span className="settings-address-actions"><button className="quiet-button" onClick={() => void copyText(location.origin).then(() => setCopied(true))}>{copied ? "已复制" : "复制"}</button>{window.CodexAndroid && <button className="quiet-button" onClick={() => window.CodexAndroid?.openConnectionSettings()}>更改</button>}</span></div>
      <p className="settings-help">其他设备只应在可信的专用局域网中使用这个地址。</p>
    </section>
    <section className="settings-section"><div className="settings-section-heading"><div><strong>本机偏好</strong><p>只对当前账号和这台浏览器生效。</p></div></div>
      <label className="settings-control-row settings-select-row"><span><strong>全局默认模型</strong><small>新建聊天优先继承当前聊天；没有可继承模型时使用此默认值。</small></span><select value={pref.defaultModel} onChange={(event) => pref.preferences.set("defaultModel", event.target.value)}><option value="">自动</option>{pref.defaultModel && model?.kind === "choice" && !model.choices.some((choice) => choice.value === pref.defaultModel) && <option value={pref.defaultModel}>{pref.defaultModel}（当前不可用）</option>}{model?.kind === "choice" && model.choices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>
      <label className="settings-control-row settings-toggle-row"><span><strong>后台完成提醒</strong><small>{!pref.completionNotifications ? "任务在后台结束时提醒我。" : notificationPermission === "granted" ? "发送系统通知，并在页签标题标出完成任务。" : "系统通知不可用时，仍会在页签标题标出完成任务。"}</small></span><input type="checkbox" checked={pref.completionNotifications} onChange={async (event) => { const value = event.target.checked; pref.preferences.set("completionNotifications", value); if (value && "Notification" in window && Notification.permission === "default") setNotificationPermission(await Notification.requestPermission()); }} /></label>
      <label className="settings-control-row settings-select-row"><span><strong>发送快捷键</strong><small>另一种组合键始终用于换行。</small></span><select value={pref.sendShortcut} onChange={(event) => pref.preferences.set("sendShortcut", event.target.value as "enter" | "ctrl-enter")}><option value="enter">Enter 发送</option><option value="ctrl-enter">Ctrl+Enter 发送</option></select></label>
    </section>
    <section className="settings-section"><div className="settings-section-heading"><div><strong>当前聊天</strong><p>{title || "请先选择聊天。"}</p></div></div>{fields.filter((field) => field.surface !== "composer" && field.role !== "planning").map((field) => <SettingControl key={field.key} field={field} current={controls?.settings[field.key] ?? ""} />)}<p className="config-note">该项按聊天独立保存，只影响随后启动的任务。</p></section>
    <div className="dialog-actions settings-dialog-actions"><span /><span /><button className="quiet-button" onClick={onClose}>完成</button></div>
  </Modal>;
}
