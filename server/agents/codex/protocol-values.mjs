import { httpError } from "../../workspace-store.mjs";

export function running(value) {
  return ["running", "inprogress", "active", "pending", "started"].includes(String(typeof value === "string" ? value : value?.type || "").toLowerCase());
}
export function milliseconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
export function itemText(item) {
  if (!item) return "";
  switch (item.type) {
    case "userMessage": return (item.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("\n");
    case "agentMessage": case "plan": return String(item.text || "");
    case "reasoning": return [...(item.summary || []), ...(item.content || [])].join("\n\n");
    case "commandExecution": return [item.command, item.aggregatedOutput, item.exitCode != null ? `Exit code: ${item.exitCode}` : ""].filter(Boolean).join("\n\n");
    case "fileChange": return (item.changes || []).map((change) => `${change.path || ""}\n${change.diff || ""}`).join("\n\n");
    default: return [item.arguments != null ? `参数\n${JSON.stringify(item.arguments, null, 2)}` : "",
      item.result != null ? `结果\n${JSON.stringify(item.result, null, 2)}` : "", item.error != null ? `错误\n${JSON.stringify(item.error, null, 2)}` : ""].filter(Boolean).join("\n\n");
  }
}
export function questionsFromItem(item) {
  if (item.type !== "agentMessage" || item.delivery !== "async") return null;
  if ((item.questions?.length || 0) > 3 || JSON.stringify(item.questions || []).length > 20_000) return null;
  const questions = (item.questions || []).map((question, index) => ({ id: `question_${index + 1}`, header: `问题 ${index + 1}`,
    question: String(question.title || ""), isOther: true, isSecret: false,
    options: (question.options || []).map((label) => ({ label, description: "" })) })).filter((question) => question.question);
  if (!questions.length && item.text) questions.push({ id: "question_1", header: "你的回答", question: item.text, isOther: true, isSecret: false, options: [] });
  return questions.length ? { id: item.id, delivery: "async", questions } : null;
}
export function answersFor(questions, candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw httpError(400, "请回答全部问题。");
  const valid = new Set(questions.map((question) => question.id));
  if (Object.keys(candidate).some((id) => !valid.has(id))) throw httpError(400, "回答中包含未知问题。");
  return Object.fromEntries(questions.map((question) => {
    const values = candidate[question.id]?.answers;
    if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== "string" || !values[0].trim()) throw httpError(400, `请回答“${question.header}”。`);
    const text = values[0].trim();
    if (!question.isOther && question.options?.length && !question.options.some((option) => option.label === text)) throw httpError(400, `“${question.header}”的回答不在可选范围内。`);
    return [question.id, { answers: [text] }];
  }));
}
export function asyncAnswer(request, answers) {
  if (!request.id || /[\r\n\]]/.test(request.id) || request.id.length > 200) throw httpError(400, "提问编号无效。");
  const values = answersFor(request.questions, answers);
  return `[CodexLAN async answer: ${request.id}]\n回答你的提问：\n${request.questions.map((question) => `${question.question}\n我的回答：${values[question.id].answers[0]}`).join("\n\n")}`;
}
export function answeredIds(turns, queue = []) {
  const values = [...turns.flatMap((turn) => (turn.items || []).filter((item) => item.type === "userMessage").map(itemText)), ...queue.map((item) => item.text)];
  return [...new Set(values.flatMap((text) => text?.match(/^\[CodexLAN async answer: ([^\r\n\]]{1,200})\]\n/)?.[1] || []))];
}
