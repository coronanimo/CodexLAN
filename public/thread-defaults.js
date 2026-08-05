const DEFAULT_MODEL_ID = "gpt-5.6-sol";

export function newThreadSettings({ projectSettings = {}, currentThread = null, projectId = null, models = [] } = {}) {
  const currentBelongsToProject = currentThread?.runtime?.projectId === projectId;
  const inherited = currentBelongsToProject ? currentThread?.settings || {} : {};
  const configured = Object.keys(inherited).length ? inherited : projectSettings || {};
  const model = availableModelId(configured.model, models) || solModelId(models);
  return {
    model,
    effort: configured.effort || "medium",
    serviceTier: configured.serviceTier || "",
    summary: configured.summary || "detailed",
  };
}

function availableModelId(modelId, models) {
  if (!modelId) return null;
  if (!models.length || models.some((model) => model.id === modelId)) return modelId;
  return null;
}

function solModelId(models) {
  return models.find((model) => model.id === DEFAULT_MODEL_ID)?.id
    || models.find((model) => /(?:^|[-\s])sol$/i.test(`${model.id || ""} ${model.displayName || ""}`))?.id
    || DEFAULT_MODEL_ID;
}
