// 從 Claude Code 的 session JSONL 產生可貼進 submission.json 的 metrics 區塊。
//
// 用法：
//   node scripts/metrics-from-claude-code.mjs <session.jsonl>
//
// session log 位置（每個專案一個資料夾，一個 session 一個 .jsonl）：
//   ~/.claude/projects/<專案 slug>/*.jsonl
// 找最近改動的那個：
//   ls -t ~/.claude/projects/*/*.jsonl | head
//
// 純 JSON 會印到 stdout（方便直接複製 / 導管），人看的摘要印到 stderr。
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/metrics-from-claude-code.mjs <session.jsonl>');
  console.error('提示：ls -t ~/.claude/projects/*/*.jsonl | head   # 列出最近的 session');
  process.exit(1);
}

let raw;
try {
  raw = await readFile(file, 'utf8');
} catch (error) {
  console.error(`讀不到檔案：${error.message}`);
  process.exit(1);
}

let inputTokens = 0;       // 非快取輸入（含 cache 寫入，approx）
let cachedInputTokens = 0; // cache 讀取
let outputTokens = 0;
let turns = 0;
let firstTs = Infinity;
let lastTs = -Infinity;
const models = new Map();
const seen = new Set(); // 以 message.id 去重，避免重覆行被重複計算

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    continue; // 忽略非 JSON 行
  }

  const ts = Date.parse(obj.timestamp);
  if (!Number.isNaN(ts)) {
    if (ts < firstTs) firstTs = ts;
    if (ts > lastTs) lastTs = ts;
  }

  if (obj.type !== 'assistant') continue;
  const msg = obj.message || {};
  const usage = msg.usage || obj.usage;
  if (!usage) continue;

  const id = msg.id;
  if (id && seen.has(id)) continue; // 同一則 assistant 訊息只算一次
  if (id) seen.add(id);

  inputTokens += (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  cachedInputTokens += usage.cache_read_input_tokens || 0;
  outputTokens += usage.output_tokens || 0;
  turns += 1;
  if (msg.model) models.set(msg.model, (models.get(msg.model) || 0) + 1);
}

if (turns === 0) {
  console.error('這個檔案裡找不到帶 usage 的 assistant 訊息，確認路徑是不是 Claude Code 的 session JSONL。');
  process.exit(1);
}

const durationMs = firstTs <= lastTs ? lastTs - firstTs : 0;
const metrics = { durationMs, inputTokens, outputTokens, cachedInputTokens };

// 人看的摘要 → stderr
const topModel = [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
console.error(`assistant 回合：${turns}`);
if (topModel) console.error(`model（供 modelId 參考）：${topModel}`);
console.error(`耗時：${(durationMs / 1000).toFixed(1)}s（整個 session 的 wall-clock，含 idle）`);
console.error('注意：cache 寫入 token 併入 inputTokens，實際單價略高，成本會略為低估。\n');

// 可直接複製的 JSON → stdout
console.log(JSON.stringify({ metrics }, null, 2));
