/** Explicitly reviewed conversation families. Unknown families remain exact-ID only. */
const families =
  /^(gpt|o[1-9]\d*|chatgpt|claude|gemini|deepseek|qwen|qwq|kimi|minimax|glm|gemma|llama|mistral|magistral|devstral|codestral|grok|nova|command|phi|nemotron|granite|olmo|ernie|solar|seed|doubao|mercury|sonar|jamba)(?:\b|\d)/;
export type GenerationModel = {
  id: string;
  family?: string;
  release_date?: string;
  type?: string;
  status?: string;
  modalities?: { input?: string[]; output?: string[] };
};
export function generationInfo(m: GenerationModel, now = Date.now()) {
  // Registry-only hidden aliases are not literal provider API IDs.
  if (m.id.startsWith('~')) return;
  if (
    (!m.type || m.type === 'chat') &&
    !['deprecated', 'retired', 'disabled'].includes(m.status ?? '') &&
    Array.isArray(m.modalities?.input) &&
    m.modalities.input.includes('text') &&
    Array.isArray(m.modalities.output) &&
    m.modalities.output.includes('text')
  ) {
    const id = m.id
      .toLowerCase()
      .replace(/^[^/]+\//, '')
      .replace(/^~/, '');
    if (
      /(?:embed|guard|moderation|realtime|transcrib|whisper|tts|image|audio|deep-research|computer-use)/.test(
        id,
      )
    )
      return;
    if (
      typeof m.family !== 'string' ||
      !m.family.trim() ||
      m.family.length > 200 ||
      !families.test(id) ||
      typeof m.release_date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(m.release_date)
    )
      return;
    const released = Date.parse(m.release_date!);
    if (
      !Number.isFinite(released) ||
      released > now ||
      new Date(released).toISOString().slice(0, 10) !== m.release_date
    )
      return;
    // Separate capability tiers, but normalize generations (kimi-k2/k3, qwen3.x, etc.).
    let family = m.family
      .toLowerCase()
      .replace(/[_.]/g, '-')
      .replace(/\d+(?:-\d+)*/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const rawBrand = id.match(families)![1];
    const brand = /^o\d+$/.test(rawBrand) ? 'o' : rawBrand;
    const tiers = id.match(
      /(?:flash-lite|sol|luna|astra|opus|sonnet|haiku|fable|flash|mini|nano|codex|instant|pro|oss)(?=-|:|$)/g,
    );
    if (['gpt', 'claude', 'gemini', 'chatgpt', 'o'].includes(brand))
      family = `${brand}-${tiers?.join('-') ?? 'base'}`;
    // Leading model-generation numbers only: never a context window, parameter count or snapshot date.
    const versionMatch =
      id.match(
        /^(?:gpt-|chatgpt-|gemini-|qwen|deepseek-v?|kimi-k|glm-|gemma-?|llama-?|minimax-m|grok-|phi-|nova-?)(\d+(?:\.\d+)*)(?=[a-z-:]|$)/,
      ) ??
      id.match(/^claude-(?:opus|sonnet|haiku|fable)-(\d+(?:[-.]\d+)*?)(?=-\d{8}$|$)/) ??
      id.match(/^claude-(\d+(?:[-.]\d+)*?)-(?:opus|sonnet|haiku)/) ??
      id.match(/^o(\d+)(?=-|$)/) ??
      id.match(
        /^(?:mistral|magistral|devstral|codestral)-(?:large-|small-|medium-)?(\d{1,2}(?:\.\d+)*)(?=-|$)/,
      );
    const version = versionMatch?.[1].split(/[.-]/).map(Number);
    return { family: `${brand}:${family}`, version, released };
  }
}
function compare(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
export function latestGenerationModels(models: GenerationModel[], now = Date.now()) {
  const groups = new Map<
    string,
    { model: GenerationModel; info: NonNullable<ReturnType<typeof generationInfo>> }[]
  >();
  for (const model of models) {
    const info = generationInfo(model, now);
    if (info) groups.set(info.family, [...(groups.get(info.family) ?? []), { model, info }]);
  }
  const result: string[] = [];
  for (const entries of groups.values()) {
    const versioned = entries.filter((e) => e.info.version);
    const best = versioned.sort((a, b) => compare(b.info.version!, a.info.version!))[0];
    const newestDate = Math.max(...entries.map((e) => e.info.released));
    const winners = entries.filter(({ info }) =>
      best
        ? info.version && compare(info.version, best.info.version!) === 0
        : info.released === newestDate,
    );
    for (const { model } of winners) {
      // Prefer an unpinned ID over its dated snapshot when both describe the same generation.
      const stable = model.id.replace(/-\d{8}(?=:|$)/, '').replace(/-\d{4}-\d{2}-\d{2}(?=:|$)/, '');
      if (stable !== model.id && winners.some((e) => e.model.id === stable)) continue;
      if (
        /-latest(?=:|$)/.test(model.id) &&
        winners.some((e) => !/-latest(?=:|$)/.test(e.model.id))
      )
        continue;
      result.push(model.id);
    }
  }
  return [...new Set(result)].sort();
}
