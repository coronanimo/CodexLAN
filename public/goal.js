const GOAL_PRESENTATIONS = {
  active: { label: "目标运行中", shortLabel: "目标中", tone: "active", control: "pause" },
  paused: { label: "目标已暂停", shortLabel: "已暂停", tone: "paused", control: "resume" },
  blocked: { label: "目标已阻塞", shortLabel: "已阻塞", tone: "blocked", control: "resume" },
  usageLimited: { label: "目标用量受限", shortLabel: "用量受限", tone: "limited", control: "resume" },
  budgetLimited: { label: "目标预算已用尽", shortLabel: "预算用尽", tone: "limited", control: "resume" },
  complete: { label: "目标已完成", shortLabel: "已完成", tone: "complete", control: null },
};

export function goalShortcut(value) {
  const match = String(value || "").match(/^\s*\/goal(?:\s+([\s\S]*))?\s*$/i);
  if (!match) return null;
  const argument = (match[1] || "").trim();
  if (!argument) return { action: "show", objective: "" };
  const action = ({ pause: "pause", resume: "resume", clear: "clear" })[argument.toLowerCase()];
  return action ? { action, objective: "" } : { action: "set", objective: argument };
}

export function goalPresentation(goal) {
  if (!goal) {
    return {
      exists: false,
      status: null,
      label: "尚未设置目标",
      shortLabel: "目标",
      tone: "empty",
      control: null,
      objective: "",
    };
  }
  const status = typeof goal.status === "string" ? goal.status : "paused";
  const presentation = GOAL_PRESENTATIONS[status]
    || { label: `目标 · ${status}`, shortLabel: "目标", tone: "paused", control: null };
  return {
    exists: true,
    status,
    objective: typeof goal.objective === "string" ? goal.objective : "",
    ...presentation,
  };
}

export function isActiveGoal(goal) {
  return goal?.status === "active";
}
