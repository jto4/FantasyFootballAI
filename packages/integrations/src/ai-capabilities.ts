/** Provider capability knowledge belongs here, never in fantasy scoring or user settings. */
export function isOfficialOpenAI(baseUrl = 'https://api.openai.com/v1'): boolean {
  return baseUrl.replace(/\/$/, '') === 'https://api.openai.com/v1';
}

export function isOpenAIReasoningModel(model: string): boolean {
  return (
    /^(?:o[134](?:-|$)|gpt-[56](?:[.-]|$))/.test(model) &&
    !/-(?:chat|codex|search|audio|realtime)(?:-|$)|preview/.test(model)
  );
}

// Reviewed against the official model catalog. This is a capability preference,
// not a claim of measured football accuracy. Unknown/new models keep manual selection.
const analysisModels = [
  'gpt-6-astra',
  'gpt-6.1-sol',
  'gpt-6-sol',
  'gpt-5.5',
  'gpt-5.4-pro',
  'gpt-5.4',
  'gpt-5.2-pro',
  'gpt-5.2',
  'o3-pro',
  'o3',
  'gpt-6-luna',
  'gpt-5.4-mini',
  'gpt-5-mini',
  'o4-mini',
  'gpt-4.1',
  'gpt-4o',
  'gpt-4o-mini',
];
export function adviceModelChoices(available: string[], saved: string, baseUrl?: string) {
  const official = isOfficialOpenAI(baseUrl);
  const rank = (id: string) =>
    analysisModels.findIndex(
      (base) =>
        id === base || new RegExp(`^${base.replace(/\./g, '\\.')}-\\d{4}-\\d{2}-\\d{2}$`).test(id),
    );
  const choices = official
    ? [...new Set(available)]
        .filter((id) => rank(id) >= 0)
        .sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b))
        .slice(0, 19)
    : [];
  const recommendedModel = choices.find(isOpenAIReasoningModel);
  if (!choices.includes(saved)) choices.push(saved);
  return {
    models: choices.map((id) => ({ id, reasoning: official && isOpenAIReasoningModel(id) })),
    ...(recommendedModel ? { recommendedModel } : {}),
  };
}
