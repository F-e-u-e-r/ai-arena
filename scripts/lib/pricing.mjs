// 把 data/pricing.json 的 models 正規化成一份查詢表：讓同一組 aliasFor 的「短 id」與
// 「完整 canonical id」都解析到同一份單價。dual-key 因此變成選填，也不會因為 submission
// 用了「沒被明確 key 的那個寫法」而無聲少算成本。遇到矛盾的設定就直接讓 build 失敗，
// 而不是默默挑一個。submission 的 modelId 本身不改，只改查詢端。

function hasRates(entry) {
  return !!entry && typeof entry.input === 'number' && typeof entry.output === 'number';
}

export function normalizePricing(models) {
  if (!models || typeof models !== 'object') return {};
  const out = { ...models };
  for (const [key, entry] of Object.entries(models)) {
    if (!entry || !entry.aliasFor) continue;
    const target = entry.aliasFor;
    if (target === key) {
      throw new Error(`pricing: "${key}" 的 aliasFor 指向自己`);
    }
    const targetEntry = models[target];
    // 不支援 alias 串接／循環（a→b→c、a→b→a）：目標本身不得再是別的 alias。
    if (targetEntry && targetEntry.aliasFor) {
      throw new Error(`pricing: 不支援 alias 串接／循環："${key}" -> "${target}" -> "${targetEntry.aliasFor}"`);
    }
    if (hasRates(entry) && hasRates(targetEntry)) {
      // 兩邊都自帶單價：必須一致，否則無從判斷該用哪個。
      if (entry.input !== targetEntry.input
          || entry.output !== targetEntry.output
          || (entry.cachedInput ?? null) !== (targetEntry.cachedInput ?? null)) {
        throw new Error(`pricing: "${key}" 與其 aliasFor "${target}" 單價不一致`);
      }
      continue; // 兩個 key 各自都已能解析到一致單價
    }
    // 只有一邊有價：讓兩個 key 都指到那份有效單價（另一邊缺價或根本不存在都適用）。
    const priced = hasRates(entry) ? entry : hasRates(targetEntry) ? targetEntry : undefined;
    if (!priced) {
      throw new Error(`pricing: alias "${key}" 與其目標 "${target}" 都查不到有效 input/output 單價`);
    }
    out[key] = priced;
    out[target] = priced;
  }
  return out;
}
