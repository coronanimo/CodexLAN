import { httpError } from "../../workspace-store.mjs";

const KEYS = ["model", "effort", "serviceTier", "summary", "collaborationMode"];
export class CodexConfiguration {
  models = [];
  modes = [];
  expires = 0;
  loading = null;
  constructor(connection) { this.connection = connection; }
  async refresh() {
    if (this.expires > Date.now()) return;
    if (!this.loading) this.loading = Promise.all([
      this.connection.request("model/list", { includeHidden: true }, { timeoutMs: 15_000 }),
      this.connection.request("collaborationMode/list", {}),
    ]).then(([models, modes]) => {
      if (!models.data?.length || !modes.data?.length) throw new Error("代理没有返回可用模型和协作模式。");
      this.models = models.data.filter((model) => !model.hidden || /mini/i.test(model.id));
      this.modes = modes.data; this.expires = Date.now() + 30 * 60_000;
    }).finally(() => { this.loading = null; });
    await this.loading;
  }
  native(settings = {}) {
    return Object.fromEntries(KEYS.flatMap((key) => {
      const value = settings[`codex.${key}`] ?? settings[key];
      return typeof value === "string" && value.trim().length <= 120 ? [[key, value.trim()]] : [];
    }));
  }
  async resolve(settings = {}) {
    const options = this.native(settings);
    if (!this.modes.length) {
      const response = await this.connection.request("collaborationMode/list", {});
      this.modes = response.data || [];
    }
    const mode = this.modes.find((entry) => entry.mode === (options.collaborationMode || "default"));
    if (!mode) throw httpError(400, "代理不支持所选协作模式。");
    let model = options.model || mode.model || this.models.find((entry) => entry.isDefault)?.id || this.models[0]?.id;
    if (!model) { await this.refresh(); model = this.models.find((entry) => entry.isDefault)?.id || this.models[0]?.id; }
    if (!model) throw new Error("代理没有提供可用模型。");
    const available = this.models.find((entry) => entry.id === model);
    if (this.models.length && !available) throw httpError(400, "所选模型当前不可用。");
    if (options.effort && available && !available.supportedReasoningEfforts?.some((entry) => entry.reasoningEffort === options.effort)) throw httpError(400, "该模型不支持所选推理深度。");
    if (options.serviceTier && available && !available.serviceTiers?.some((entry) => entry.id === options.serviceTier)) throw httpError(400, "该模型不支持所选服务档位。");
    if (options.summary && !["auto", "concise", "detailed", "none"].includes(options.summary)) throw httpError(400, "思路摘要档位无效。");
    return { ...options, model, effort: options.effort || available?.defaultReasoningEffort || mode.reasoning_effort || null,
      collaboration: { mode: mode.mode, settings: { model, reasoning_effort: options.effort || available?.defaultReasoningEffort || mode.reasoning_effort || null, developer_instructions: null } } };
  }
  async fields() {
    await this.refresh();
    const choice = (key, label, choices, role, extra = {}) => ({ key: `codex.${key}`, label, kind: "choice", choices, role, surface: ["model", "reasoning", "service-tier"].includes(role) ? "composer" : "settings", ...extra });
    const choices = (values) => [...new Set(values)].map((value) => ({ value, label: value }));
    const effort = (value) => ({ value, label: ({ low: "低", medium: "中", high: "高", xhigh: "超高", max: "最高" })[value] || value });
    const tierLabel = (tier) => ({ standard: "标准", default: "标准", fast: "快速", priority: "快速", ultrafast: "超快", flex: "弹性" })[String(tier.name || tier.id).toLowerCase()] || "服务档";
    const tiers = (model) => [{ value: "", label: "标准" }, ...(model.serviceTiers || []).filter((entry) => entry.id && !["default", "standard"].includes(entry.id)).map((entry) => ({ value: entry.id, label: tierLabel(entry) }))];
    const defaultModel = this.models.find((model) => model.id === "gpt-5.6-sol") || this.models.find((model) => /(?:^|[-\s])sol$/i.test(`${model.id} ${model.displayName || ""}`)) || this.models.find((model) => model.isDefault) || this.models[0];
    return [choice("model", "模型", this.models.map((model) => ({ value: model.id, label: String(model.displayName || model.id).replace(/^gpt[-\s]*/i, "") })), "model", { defaultValue: defaultModel.id }),
      choice("effort", "推理深度", choices(this.models.flatMap((model) => (model.supportedReasoningEfforts || []).map((entry) => entry.reasoningEffort))).map(({ value }) => effort(value)), "reasoning", { defaultValue: "medium", choiceSource: { key: "codex.model", values: Object.fromEntries(this.models.map((model) => [model.id, (model.supportedReasoningEfforts || []).map((entry) => effort(entry.reasoningEffort))])), defaults: Object.fromEntries(this.models.map((model) => [model.id, model.defaultReasoningEffort || model.supportedReasoningEfforts?.[0]?.reasoningEffort || "medium"])) } }),
      choice("summary", "思路摘要", [{ value: "auto", label: "自动" }, { value: "concise", label: "简洁" }, { value: "detailed", label: "详细" }, { value: "none", label: "关闭" }], "summary", { defaultValue: "detailed", description: "控制回答前显示的推理摘要详细程度。" }),
      choice("serviceTier", "优先级", [{ value: "", label: "标准" }, ...choices(this.models.flatMap((model) => (model.serviceTiers || []).map((entry) => entry.id)))], "service-tier", { defaultValue: "", choiceSource: { key: "codex.model", values: Object.fromEntries(this.models.map((model) => [model.id, tiers(model)])) } }),
      choice("collaborationMode", "规划模式", this.modes.map((mode) => ({ value: mode.mode, label: mode.mode === "plan" ? "规划" : "默认" })), "planning", { defaultValue: "default", switchValues: { enabled: "plan", disabled: "default" } })];
  }
}
