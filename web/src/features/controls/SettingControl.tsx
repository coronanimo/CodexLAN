import { useState } from "react";
import type { AgentSetting } from "@lan/agent-contract";
import { useActions } from "../../app/ActionContext";
import { useAppSelector } from "../../app/hooks";
import { Dropdown } from "../../components/Dropdown";
import { Icon } from "../../components/Icon";

export function settingChoices(field: AgentSetting, settings: Record<string, unknown>) {
  return field.kind === "choice" ? field.choiceSource?.values[String(settings[field.choiceSource.key])] || field.choices : [];
}
export function SettingControl({ field, current, compact, disabled = false }: { field: AgentSetting; current: string | number | boolean; compact?: number; disabled?: boolean }) {
  const actions = useActions(), settings = useAppSelector((state) => actions ? state.controls[actions.conversationId]?.settings : undefined);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const save = async (value: string | number | boolean) => {
    if (!actions || pending) return;
    setPending(true); setError("");
    try { await actions.execute({ type: "settings", values: { [field.key]: value } }); }
    catch (error) { setError(error instanceof Error ? error.message : "设置失败。"); }
    finally { setPending(false); }
  };
  const choices = settingChoices(field, settings || {});
  if (compact !== undefined && field.kind === "choice") return <div className={`compact-select ${["compact-model", "compact-effort", "compact-tier"][compact]}`}>
    <Dropdown label={`当前聊天${field.label}`} disabled={disabled || pending || !actions || !choices.length || field.role === "service-tier" && choices.length < 2} triggerClassName="compact-select-trigger" panelClassName="compact-select-menu" align="left" trigger={<><span>{choices.find((option) => option.value === current)?.label || String(current) || "默认"}</span><Icon name="chevron" /></>}>
      {choices.map((option) => <button key={option.value} aria-pressed={option.value === current} onClick={() => void save(option.value)}>{option.label}</button>)}
    </Dropdown>{error && <span role="alert">{error}</span>}
  </div>;
  return <label className={`settings-control-row ${field.kind === "toggle" ? "settings-toggle-row" : "settings-select-row"}`}><span><strong>{field.label}</strong>{field.description && <small>{field.description}</small>}</span>{field.kind === "toggle" ? <input disabled={!actions || pending} type="checkbox" checked={current === true} onChange={(event) => void save(event.target.checked)} />
    : field.kind === "number" ? <input disabled={!actions || pending} type="number" min={field.min} max={field.max} value={String(current)} onChange={(event) => { if (event.currentTarget.checkValidity() && Number.isFinite(event.currentTarget.valueAsNumber)) void save(event.currentTarget.valueAsNumber); }} />
    : <select disabled={!actions || pending} value={String(current)} onChange={(event) => void save(event.target.value)}>
      {!choices.some((option) => option.value === current) && <option value={String(current)}>{String(current) || "默认"}</option>}{choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>}{error && <span role="alert">{error}</span>}</label>;
}
