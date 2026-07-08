// 把 data/pricing.json 的 models 正規化成一份查詢表：讓同一組 aliasFor 的「短 id」與
// 「完整 canonical id」都解析到同一份單價。dual-key 因此變成選填，也不會因為 submission
// 用了「沒被明確 key 的那個寫法」而無聲少算成本。遇到矛盾的設定就直接讓 build 失敗，
// 而不是默默挑一個。submission 的 modelId 本身不改，只改查詢端。
//
// 以 canonical target 為單位分組處理：同一個 canonical 底下所有帶價的來源（目標本身
// 加上每個指向它的 alias）必須一致，否則 throw——這樣就算多個 alias 指向同一個「尚未
// 存在」的 canonical，也不會因 JSON 插入順序而默默覆蓋成不同單價。

function hasRates(entry) {
  return !!entry && typeof entry.input === 'number' && typeof entry.output === 'number';
}

function ratesConflict(a, b) {
  return a.input !== b.input
    || a.output !== b.output
    || (a.cachedInput ?? null) !== (b.cachedInput ?? null);
}

export function normalizePricing(models) {
  if (!models || typeof models !== 'object') return {};
  const out = { ...models };

  // 先做結構檢查：不允許 aliasFor 指向自己，也不允許串接／循環（目標本身又是 alias）。
  for (const [key, entry] of Object.entries(models)) {
    if (!entry || !entry.aliasFor) continue;
    if (entry.aliasFor === key) {
      throw new Error(`pricing: "${key}" 的 aliasFor 指向自己`);
    }
    const targetEntry = models[entry.aliasFor];
    if (targetEntry && targetEntry.aliasFor) {
      throw new Error(`pricing: 不支援 alias 串接／循環："${key}" -> "${entry.aliasFor}" -> "${targetEntry.aliasFor}"`);
    }
  }

  // 依 canonical target 分組：收集每組的 alias key 與所有帶價來源。
  const groups = new Map();
  for (const [key, entry] of Object.entries(models)) {
    if (!entry || !entry.aliasFor) continue;
    const target = entry.aliasFor;
    let group = groups.get(target);
    if (!group) {
      group = { aliasKeys: new Set(), rateSources: [] };
      groups.set(target, group);
    }
    group.aliasKeys.add(key);
    if (hasRates(entry)) group.rateSources.push({ id: key, rates: entry });
  }

  for (const [target, group] of groups) {
    if (hasRates(models[target])) group.rateSources.push({ id: target, rates: models[target] });
    if (group.rateSources.length === 0) {
      throw new Error(`pricing: 指向 "${target}" 的 alias 與其目標都查不到有效 input/output 單價`);
    }
    // 同一 canonical 的所有帶價來源必須一致，否則無從判斷該用哪個。
    const canonical = group.rateSources[0];
    for (const source of group.rateSources.slice(1)) {
      if (ratesConflict(canonical.rates, source.rates)) {
        throw new Error(`pricing: 指向 "${target}" 的單價來源不一致（${canonical.id} vs ${source.id}）`);
      }
    }
    // 一致後，canonical 與所有 alias key 都指向同一份單價。
    out[target] = canonical.rates;
    for (const key of group.aliasKeys) out[key] = canonical.rates;
  }

  return out;
}
