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
    if (options.summary && !["auto", "concise", "detailed", "none"].includes(options.summary)) throw httpError(400, "思路摘要档位无效。");
    return { ...options, model, effort: options.effort || available?.defaultReasoningEffort || mode.reasoning_effort || null,
      collaboration: { mode: mode.mode, settings: { model, reasoning_effort: options.effort || available?.defaultReasoningEffort || mode.reasoning_effort || null, developer_instructions: null } } };
  }
  async fields() {
    await this.refresh();
    const choice = (key, label, choices) => ({ key: `codex.${key}`, label, kind: "choice", choices });
    const choices = (values) => [...new Set(values)].map((value) => ({ value, label: value }));
    return [choice("model", "模型", this.models.map((model) => ({ value: model.id, label: model.displayName || model.id }))),
      choice("effort", "推理深度", choices(this.models.flatMap((model) => (model.supportedReasoningEfforts || []).map((entry) => entry.reasoningEffort)))),
      choice("summary", "思路摘要", choices(["auto", "concise", "detailed", "none"])),
      choice("serviceTier", "服务档位", [{ value: "", label: "默认" }, ...choices(this.models.flatMap((model) => (model.serviceTiers || []).map((entry) => entry.id)))]),
      choice("collaborationMode", "协作模式", this.modes.map((mode) => ({ value: mode.mode, label: mode.mode === "plan" ? "计划" : "默认" })))];
  }
}
