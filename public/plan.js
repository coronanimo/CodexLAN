export function planShortcut(value) {
  const match = String(value || "").match(/^\s*\/plan(?:\s+([\s\S]*))?\s*$/i);
  if (!match) return null;
  return { prompt: (match[1] || "").trim() };
}

export function turnPlanSnapshot(value = {}) {
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

export function createTurnPlanView(value) {
  const root = document.createElement("details");
  root.className = "turn-plan";
  const summary = document.createElement("summary");
  const kind = document.createElement("strong");
  kind.className = "turn-plan-kind";
  kind.textContent = "计划";
  const title = document.createElement("span");
  title.className = "turn-plan-title";
  const count = document.createElement("span");
  count.className = "turn-plan-count";
  const caret = document.createElement("span");
  caret.className = "turn-plan-caret";
  summary.append(kind, title, count, caret);
  const body = document.createElement("div");
  body.className = "turn-plan-body";
  root.append(summary, body);
  const view = { root, title, count, body };
  updateTurnPlanView(view, value);
  return view;
}

export function updateTurnPlanView(view, value) {
  const presentation = turnPlanPresentation(value);
  view.title.textContent = presentation.title;
  view.count.textContent = presentation.total ? `${presentation.completed}/${presentation.total}` : "";
  view.root.classList.toggle("complete", presentation.status === "completed");
  view.root.classList.toggle("running", presentation.status === "inProgress");
  view.body.replaceChildren();
  if (presentation.explanation) {
    const explanation = document.createElement("p");
    explanation.textContent = presentation.explanation;
    view.body.append(explanation);
  }
  const list = document.createElement("ol");
  for (const entry of presentation.plan) {
    const row = document.createElement("li");
    row.className = entry.status;
    const marker = document.createElement("span");
    marker.textContent = entry.status === "completed" ? "✓" : entry.status === "inProgress" ? "•" : "○";
    const step = document.createElement("span");
    step.textContent = entry.step;
    row.append(marker, step);
    list.append(row);
  }
  if (list.childElementCount) view.body.append(list);
  view.root.hidden = !presentation.total && !presentation.explanation;
  return presentation;
}
