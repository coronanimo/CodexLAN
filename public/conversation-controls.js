// Views only. Request identity, delivery and answer receipts remain in the
// conversation model; a streaming update must not recreate a live form.
export function createAsyncQuestionView(request, form) {
  const root = document.createElement("section");
  root.className = "async-question-card";
  root.dataset.asyncRequestId = request.requestId;
  root.setAttribute("aria-label", "待回答的问题");
  const resume = document.createElement("button");
  resume.type = "button";
  resume.className = "question-summary";
  resume.setAttribute("aria-label", "继续回答");
  resume.setAttribute("aria-controls", `question-form-${request.requestId}`);
  const caret = document.createElement("span");
  caret.className = "disclosure-caret";
  caret.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "question-summary-state";
  label.textContent = "待回答";
  const summary = document.createElement("span");
  summary.className = "question-summary-text";
  summary.textContent = request.questions.map((question) => question.question).join("；");
  summary.title = summary.textContent;
  resume.append(caret, label, summary);
  form.id = `question-form-${request.requestId}`;
  root.append(resume, form);
  return { request, root, resume, summary, form, collapsed: false, answered: false };
}

export function setAsyncQuestionCollapsed(view, collapsed) {
  view.collapsed = collapsed;
  view.root.dataset.state = collapsed ? "deferred" : "pending";
  view.form.hidden = collapsed;
  view.resume.hidden = !collapsed;
  view.resume.setAttribute("aria-expanded", String(!collapsed));
}

export function showAnsweredAsyncQuestion(view, request, answerText = "") {
  const root = view.root;
  const hadFocus = root.contains(document.activeElement);
  const wasOpen = root.querySelector(".async-answer-record")?.open || false;
  const record = document.createElement("details");
  record.className = "async-answer-record";
  record.open = wasOpen;
  const summary = document.createElement("summary");
  summary.className = "question-summary";
  const caret = document.createElement("span");
  caret.className = "disclosure-caret";
  caret.setAttribute("aria-hidden", "true");
  const state = document.createElement("span");
  state.className = "question-summary-state";
  state.textContent = "已回答";
  const text = document.createElement("span");
  text.className = "question-summary-text";
  text.textContent = request.questions.map((question) => question.question).join("；");
  text.title = text.textContent;
  summary.append(caret, state, text);
  const body = document.createElement("div");
  body.className = "question-answer-body";
  const contents = document.createElement("p");
  contents.textContent = answerText || request.questions.map((question) => question.question).join("\n\n");
  body.append(contents);
  if (!answerText) {
    const syncing = document.createElement("small");
    syncing.textContent = "回答已送达，正文尚未同步。";
    body.append(syncing);
  }
  record.append(summary, body);
  root.dataset.state = "answered";
  root.setAttribute("aria-label", "已回答的问题");
  root.replaceChildren(record);
  if (hadFocus) summary.focus({ preventScroll: true });
  view.answered = true;
  view.answerText = answerText;
}
