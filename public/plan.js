export function planShortcut(value) {
  const match = String(value || "").match(/^\s*\/plan(?:\s+([\s\S]*))?\s*$/i);
  if (!match) return null;
  return { prompt: (match[1] || "").trim() };
}

export function turnPlanSnapshot(value = {}) {
  value = value || {};
  const plan = Array.isArray(value.plan)
    ? value.plan.map(({ step, status }) => ({ step, status }))
    : [];
  return { plan, ...(value.explanation ? { explanation: value.explanation } : {}) };
}

export function turnPlanPresentation(value = {}) {
  const snapshot = turnPlanSnapshot(value);
  const completed = snapshot.plan.filter((entry) => entry.status === "completed").length;
  const current = snapshot.plan.find((entry) => entry.status === "inProgress")
    || snapshot.plan.find((entry) => entry.status === "pending")
    || snapshot.plan.at(-1);
  const complete = snapshot.plan.length > 0 && completed === snapshot.plan.length;
  return {
    ...snapshot,
    completed,
    total: snapshot.plan.length,
    title: complete ? "计划已完成" : current?.step || "计划已更新",
    status: complete ? "completed" : current?.status || "pending",
  };
}

export function renderTurnPlanDetails(body, value = {}) {
  const presentation = turnPlanPresentation(value);
  body.replaceChildren();
  const list = document.createElement("ol");
  for (const entry of presentation.plan) {
    const row = document.createElement("li");
    row.className = entry.status;
    const marker = document.createElement("span");
    marker.className = "turn-plan-marker";
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", entry.status === "completed" ? "已完成" : entry.status === "inProgress" ? "进行中" : "待执行");
    const step = document.createElement("span");
    step.textContent = entry.step;
    row.append(marker, step);
    list.append(row);
  }
  if (list.childElementCount) body.append(list);
}
