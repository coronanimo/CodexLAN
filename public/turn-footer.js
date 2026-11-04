import { formatDuration } from "./elapsed-time.js";
import { executionItemText } from "./execution-events.js";
import { renderTurnPlanDetails, turnPlanPresentation } from "./plan.js";
import { diffLineStats } from "./diff-output.js";

// Plans stay readable independently of the optional timing/recovery details.
export function createTurnFooter({ id, onDiff, onCopy }) {
  const root = document.createElement("aside");
  root.className = "turn-footer";
  root.setAttribute("aria-label", "本轮任务");
  const bar = document.createElement("div");
  bar.className = "turn-footer-bar";
  const kind = document.createElement("span");
  kind.className = "turn-footer-kind";
  kind.textContent = "小结";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "turn-footer-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", `turn-details-${id}`);
  toggle.setAttribute("aria-label", "展开本轮详情");
  toggle.title = "耗时与执行详情";
  const more = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  more.setAttribute("viewBox", "0 0 24 24");
  more.setAttribute("aria-hidden", "true");
  for (const cx of [5, 12, 19]) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", "12");
    dot.setAttribute("r", "1.5");
    more.append(dot);
  }
  toggle.append(more);
  const status = document.createElement("div");
  status.className = "turn-footer-status";
  const headline = document.createElement("span");
  headline.className = "turn-footer-headline";
  const progress = document.createElement("span");
  progress.className = "turn-footer-progress";
  const elapsed = document.createElement("span");
  elapsed.className = "turn-footer-elapsed";
  status.append(headline);
  const diff = document.createElement("button");
  diff.type = "button";
  diff.className = "turn-footer-diff";
  diff.setAttribute("aria-label", "查看本轮累计文件差异");
  diff.title = "查看本轮累计文件差异";
  diff.hidden = true;
  const files = document.createElement("span");
  files.className = "turn-footer-files";
  const added = document.createElement("span");
  added.className = "turn-footer-added";
  const removed = document.createElement("span");
  removed.className = "turn-footer-removed";
  diff.append(files, added, removed);
  status.append(diff);
  diff.onclick = onDiff;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-text-button icon-copy-button turn-footer-copy";
  copy.textContent = "复制过程";
  copy.title = "复制过程";
  copy.setAttribute("aria-label", "复制执行过程的 Markdown 原文");
  copy.onclick = () => onCopy(copy);
  const tools = document.createElement("div");
  tools.className = "turn-footer-tools";
  tools.append(toggle, copy, elapsed);
  bar.append(kind, status, tools);
  const details = document.createElement("div");
  details.id = `turn-details-${id}`;
  details.className = "turn-footer-details";
  details.hidden = true;
  const plan = document.createElement("section");
  plan.className = "turn-footer-plan";
  const planHeading = document.createElement("h4");
  planHeading.textContent = "计划 ";
  const planTitle = document.createElement("span");
  planTitle.className = "turn-plan-title";
  planHeading.append(progress, planTitle);
  const planBody = document.createElement("div");
  planBody.className = "turn-plan-body";
  plan.append(planHeading, planBody);
  const timing = document.createElement("section");
  timing.className = "turn-footer-timing";
  const timingHeading = document.createElement("h4");
  timingHeading.textContent = "耗时";
  const timingList = document.createElement("dl");
  timing.append(timingHeading, timingList);
  const fields = {};
  for (const [key, label] of [["total", "总耗时"], ["command", "命令"], ["codex", "Codex ≈"]]) {
    const field = document.createElement("div");
    field.className = "turn-footer-timing-field";
    field.dataset.metric = key;
    const name = document.createElement("dt");
    name.textContent = label;
    const value = document.createElement("dd");
    field.append(name, value);
    timingList.append(field);
    fields[key] = { name, value };
  }
  const recovery = document.createElement("section");
  recovery.className = "turn-footer-recovery";
  const recoveryHeading = document.createElement("h4");
  recoveryHeading.textContent = "恢复记录 · 原始位置未知";
  const recoveryBody = document.createElement("div");
  recovery.append(recoveryHeading, recoveryBody);
  const diagnostics = document.createElement("div");
  diagnostics.className = "turn-footer-diagnostics";
  status.append(timing);
  details.append(recovery, diagnostics);
  root.append(plan, bar, details);
  toggle.onclick = () => {
    details.hidden = !details.hidden;
    toggle.setAttribute("aria-expanded", String(!details.hidden));
    toggle.setAttribute("aria-label", details.hidden ? "展开本轮详情" : "收起本轮详情");
  };
  return { root, status, tools, toggle, headline, progress, planTitle, elapsed, diff, files, added, removed, copy, details, plan, planBody, timing, fields, recovery, recoveryBody, diagnostics };
}

export function updateTurnFooter(view, { label, tone, running, plan, timing, recovered = [], changes = [], copyable = false }) {
  const presentation = turnPlanPresentation(plan);
  view.root.dataset.tone = tone;
  if (running && view.elapsed.parentElement !== view.tools) view.tools.append(view.elapsed);
  if (!running && view.elapsed.parentElement !== view.status) view.status.insertBefore(view.elapsed, view.diff);
  view.status.tabIndex = running ? -1 : 0;
  if (!running) view.status.setAttribute("aria-label", "本轮小结，窄屏可横向滚动查看完整耗时");
  else view.status.removeAttribute("aria-label");
  view.headline.textContent = label;
  view.headline.title = view.headline.textContent;
  view.progress.textContent = presentation.total ? `${presentation.completed}/${presentation.total}` : "";
  view.progress.hidden = !presentation.total;
  view.progress.title = `计划已完成 ${presentation.completed}/${presentation.total}`;
  const count = new Set(changes.map((change) => change.path).filter(Boolean)).size;
  view.diff.hidden = !changes.length;
  view.files.textContent = count ? `${count} 个文件` : "查看差异";
  const stats = diffLineStats(changes);
  view.added.textContent = `+${stats.added}`;
  view.removed.textContent = `−${stats.removed}`;
  view.added.hidden = !stats.added;
  view.removed.hidden = !stats.removed;
  view.diff.setAttribute("aria-label", `查看本轮累计文件差异${count ? `：${count} 个文件` : ""}，新增 ${stats.added} 行，删除 ${stats.removed} 行`);
  view.copy.hidden = running || !copyable;
  view.plan.hidden = !presentation.total && !presentation.explanation;
  view.planTitle.textContent = presentation.explanation || "";
  view.planTitle.title = presentation.explanation || "";
  view.planTitle.hidden = !presentation.explanation;
  if (view.planValue !== plan) {
    renderTurnPlanDetails(view.planBody, plan);
    view.planValue = plan;
  }
  view.timing.hidden = running || !timing;
  if (timing) {
    view.fields.total.value.textContent = formatDuration(timing.totalMs);
    const command = timing.commandUnknownCount
      ? timing.commandMs > 0 ? `≥ ${formatDuration(timing.commandMs)}` : "未记录"
      : formatDuration(timing.commandMs);
    view.fields.command.value.textContent = `${command} · ${timing.commandCount} 项`;
    view.fields.codex.name.textContent = timing.codexMs === null ? "Codex" : "Codex ≈";
    view.fields.codex.value.textContent = timing.codexMs === null ? "未记录（命令数据不全）" : `${formatDuration(timing.codexMs)}（推算）`;
  }
  view.recovery.hidden = !recovered.length;
  const hasDetails = !view.recovery.hidden || view.diagnostics.childElementCount > 0;
  view.toggle.disabled = !hasDetails;
  view.toggle.hidden = !running || !hasDetails;
  if (!running || !hasDetails) {
    view.details.hidden = !hasDetails;
    view.toggle.setAttribute("aria-expanded", "false");
    view.toggle.setAttribute("aria-label", "展开本轮详情");
  }
  // Recovery details are bounded; never invent a position in the transcript.
  view.recoveryBody.replaceChildren(...recovered.map((item) => {
    const pre = document.createElement("pre");
    pre.textContent = executionItemText(item);
    return pre;
  }));
}
