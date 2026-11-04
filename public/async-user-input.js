import { isActiveThreadRuntime } from "./workspace.js";

// Async questions are agent messages, not blocking JSON-RPC requests.
export function asyncUserInputRequest(item, { threadId, turnId } = {}) {
  if (item?.type !== "agentMessage" || item.delivery !== "async" || !item.id) return null;
  const questions = Array.isArray(item.questions) ? item.questions : [];
  const normalized = questions.map((question, index) => ({
    id: `question_${index + 1}`,
    header: `问题 ${index + 1}`,
    question: typeof question?.title === "string" ? question.title.trim() : "",
    options: (Array.isArray(question?.options) ? question.options : [])
      .filter((option) => typeof option === "string" && option.trim())
      .map((label) => ({ label: label.trim(), description: "" })),
    isOther: true,
    isSecret: false,
  })).filter((question) => question.question);
  // Older app-server builds expose delivery but omit experimental questions.
  if (!normalized.length && typeof item.text === "string" && item.text.trim()) {
    normalized.push({ id: "question_1", header: "你的回答", question: item.text.trim(), options: [], isOther: true, isSecret: false });
  }
  if (!normalized.length) return null;
  return { requestId: item.id, itemId: item.id, threadId, turnId, delivery: "async", isBlocking: false, questions: normalized };
}

const ANSWER_MARKER = /^\[CodexLAN async answer: ([^\r\n\]]{1,200})\]\n/;

export function asyncAnswerMessage(request, answers) {
  if (!request?.requestId || /[\r\n\]]/.test(request.requestId) || request.requestId.length > 200) throw new Error("提问编号无效。");
  return `[CodexLAN async answer: ${request.requestId}]\n回答你的提问：\n${request.questions.map((question) => (
    `${question.question}\n我的回答：${answers[question.id].answers[0]}`
  )).join("\n\n")}`;
}

export function asyncAnswerRequestId(text) {
  return typeof text === "string" ? text.match(ANSWER_MARKER)?.[1] || null : null;
}

export function displayUserInputText(text) {
  return typeof text === "string" ? text.replace(ANSWER_MARKER, "") : "";
}

// The marker travels with the actual user message, surviving server restarts,
// thread history reloads, and queued answers without a separate browser store.
export function answeredAsyncRequestIds(turns = [], queue = []) {
  const texts = turns.flatMap((turn) => (turn.items || []).filter((item) => item.type === "userMessage")
    .map((item) => (item.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n")));
  const ids = [...texts, ...queue.map((item) => item.text)].map(asyncAnswerRequestId).filter(Boolean);
  return [...new Set(ids)];
}

export function asyncAnswerText(requestId, turns = [], queue = []) {
  const texts = turns.flatMap((turn) => (turn.items || []).filter((item) => item.type === "userMessage")
    .map((item) => (item.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n")));
  const text = [...texts, ...queue.map((item) => item.text)].find((value) => asyncAnswerRequestId(value) === requestId);
  return text ? displayUserInputText(text).replace(/^回答你的提问：\n/, "") : "";
}

export function asyncQuestionDeferred(storage, key, requestKey) {
  try {
    const saved = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(saved) && saved.includes(requestKey);
  } catch { return false; }
}

export function setAsyncQuestionDeferred(storage, key, requestKey, deferred) {
  try {
    const saved = JSON.parse(storage.getItem(key) || "[]");
    const ids = new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []);
    if (deferred) ids.add(requestKey);
    else ids.delete(requestKey);
    storage.setItem(key, JSON.stringify([...ids]));
  } catch {}
}

export async function deliverAsyncUserInput({ request, answers, projectId, api }) {
  const base = `/api/threads/${encodeURIComponent(request.threadId)}`;
  try {
    return await api(`${base}/async-user-input/${encodeURIComponent(request.itemId)}`, {
      method: "POST", body: { projectId, answers },
    });
  } catch (error) {
    // A running server may still have the old router. Only a definite missing
    // endpoint can use the existing delivery API; never replay ambiguous errors.
    if (error.message !== "找不到 API。") throw error;
  }
  const text = asyncAnswerMessage(request, answers);
  const readRuntime = async () => (await api(`${base}?projectId=${encodeURIComponent(projectId)}`)).runtime;
  const runtime = await readRuntime();
  if (isActiveThreadRuntime(runtime)) {
    if (!runtime.activeTurnId) throw new Error("当前任务状态正在更新，请稍后重试。");
    try {
      return { ...await api(`${base}/steer`, { method: "POST", body: { projectId, expectedTurnId: runtime.activeTurnId, text } }), delivery: "guide" };
    } catch (error) {
      if (!/no active turn|not active|turn.*(mismatch|does not match)|expected.*turn/i.test(error.message)) throw error;
      if (isActiveThreadRuntime(await readRuntime())) throw error;
    }
  }
  return { ...await api(`${base}/queue`, { method: "POST", body: { projectId, text } }), delivery: "queued" };
}
