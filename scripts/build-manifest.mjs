import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasksDir = path.join(rootDir, 'tasks');
const pricingPath = path.join(rootDir, 'data', 'pricing.json');
const outputArg = process.argv.indexOf('--output');
if (outputArg !== -1 && !process.argv[outputArg + 1]) {
  throw new Error('--output requires a file path');
}
const outputPath = outputArg === -1
  ? path.join(rootDir, 'tasks.json')
  : path.resolve(process.cwd(), process.argv[outputArg + 1]);
const mediaTypes = new Set(['iframe', 'image', 'video', 'model-viewer']);

// 已知 client 只用來提醒可能的 typo；未知值仍可正常顯示（比照 effort 的自由字串設計）。
const knownClients = new Set(['claude-code', 'codex', 'opencode', 'kiro', 'cursor', 'api', 'other']);
const metricFields = new Set(['durationMs', 'inputTokens', 'outputTokens', 'cachedInputTokens', 'totalTokens']);

let pricing = {};
const missingPricing = new Set();
const unknownClients = new Set();

function fail(message) {
  throw new Error(message);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`${path.relative(rootDir, filePath)}: ${error.message}`);
  }
}

async function loadPricing() {
  try {
    await stat(pricingPath);
  } catch {
    console.warn('⚠ 找不到 data/pricing.json，所有 costUsd 會顯示為 —');
    return {};
  }
  const data = await readJson(pricingPath);
  return data.models && typeof data.models === 'object' ? data.models : {};
}

async function directories(parent) {
  return (await readdir(parent, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function isExternal(value) {
  return /^https:/.test(value);
}

function webPath(absolutePath, trailingSlash = false) {
  const relative = path.relative(rootDir, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`media path escapes the repository: ${absolutePath}`);
  }
  const result = relative.split(path.sep).join('/');
  return trailingSlash ? `${result.replace(/\/$/, '')}/` : result;
}

async function resolveMediaPath(submissionDir, value, trailingSlash = false) {
  if (isExternal(value)) return value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    fail(`unsupported media URL protocol: ${value}`);
  }
  const absolutePath = path.resolve(submissionDir, value);
  await stat(absolutePath).catch(() => fail(`missing media: ${webPath(absolutePath)}`));
  return webPath(absolutePath, trailingSlash);
}

function validateType(type, filePath) {
  if (!mediaTypes.has(type)) {
    fail(`${filePath}: unsupported type "${type}"`);
  }
}

// metrics 內的每個欄位都必須是有限、非負的數字，避免髒資料破壞 cost 與排行。
function validateMetrics(metrics, label) {
  if (metrics == null) return;
  if (typeof metrics !== 'object' || Array.isArray(metrics)) {
    fail(`${label}: "metrics" must be an object`);
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (!metricFields.has(key)) continue; // 允許額外欄位通過，只驗證已知的數值欄位
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      fail(`${label}: metrics.${key} must be a non-negative number`);
    }
  }
}

// cost = (input·單價 + output·單價 + cached·快取價) / 1M。cached 省略單價時退回 input 價。
function computeCost(modelId, metrics) {
  if (!metrics) return undefined;
  const hasTokens = ['inputTokens', 'outputTokens', 'cachedInputTokens']
    .some(k => typeof metrics[k] === 'number');
  if (!hasTokens) return undefined;
  const rates = modelId ? pricing[modelId] : undefined;
  if (!rates) {
    if (modelId) missingPricing.add(modelId);
    return undefined;
  }
  if (typeof rates.input !== 'number' || typeof rates.output !== 'number') {
    if (modelId) missingPricing.add(modelId);
    return undefined;
  }
  const input = metrics.inputTokens || 0;
  const output = metrics.outputTokens || 0;
  const cached = metrics.cachedInputTokens || 0;
  const cachedRate = typeof rates.cachedInput === 'number' ? rates.cachedInput : rates.input;
  const usd = (input * rates.input + output * rates.output + cached * cachedRate) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

async function buildSubmission(task, taskId, submissionId) {
  const submissionDir = path.join(tasksDir, taskId, submissionId);
  const metadataPath = path.join(submissionDir, 'submission.json');
  const metadata = await readJson(metadataPath);
  const label = webPath(metadataPath);

  if (!metadata.provider) fail(`${label}: "provider" is required`);
  if (!metadata.model) fail(`${label}: "model" is required`);
  if (metadata.client && !knownClients.has(metadata.client)) unknownClients.add(metadata.client);
  validateMetrics(metadata.metrics, label);

  const type = metadata.type || task.type || 'iframe';
  validateType(type, label);

  const submission = {
    ...metadata,
    id: metadata.id || submissionId
  };

  const cost = computeCost(metadata.modelId, metadata.metrics);
  if (cost !== undefined) submission.costUsd = cost;

  if (type === 'iframe') {
    if (metadata.path) {
      submission.path = await resolveMediaPath(submissionDir, metadata.path, true);
    } else {
      submission.path = webPath(submissionDir, true);
      await stat(path.join(submissionDir, 'index.html'))
        .catch(() => fail(`${label}: iframe submission needs index.html or an explicit path`));
    }
  } else {
    if (!metadata.src) fail(`${label}: "${type}" submission requires "src"`);
    submission.src = await resolveMediaPath(submissionDir, metadata.src);
    if (metadata.poster) {
      submission.poster = await resolveMediaPath(submissionDir, metadata.poster);
    }
  }

  return submission;
}

async function buildTask(taskId) {
  const taskDir = path.join(tasksDir, taskId);
  const metadataPath = path.join(taskDir, 'task.json');
  const metadata = await readJson(metadataPath);
  const id = metadata.id || taskId;

  if (!metadata.title) fail(`${webPath(metadataPath)}: "title" is required`);
  validateType(metadata.type || 'iframe', webPath(metadataPath));

  const submissions = [];
  const submissionIds = new Set();
  for (const submissionId of await directories(taskDir)) {
    const submissionMetadata = path.join(taskDir, submissionId, 'submission.json');
    try {
      await stat(submissionMetadata);
    } catch {
      continue;
    }
    const submission = await buildSubmission(metadata, taskId, submissionId);
    if (submissionIds.has(submission.id)) {
      fail(`${webPath(submissionMetadata)}: duplicate submission id "${submission.id}" in task "${id}"`);
    }
    submissionIds.add(submission.id);
    submissions.push(submission);
  }

  submissions.sort((a, b) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id)
  );

  return { ...metadata, id, submissions };
}

try {
  pricing = await loadPricing();
  const tasks = [];
  const ids = new Set();

  for (const taskId of await directories(tasksDir)) {
    const metadataPath = path.join(tasksDir, taskId, 'task.json');
    try {
      await stat(metadataPath);
    } catch {
      continue;
    }

    const task = await buildTask(taskId);
    if (ids.has(task.id)) fail(`duplicate task id: ${task.id}`);
    ids.add(task.id);
    tasks.push(task);
  }

  tasks.sort((a, b) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id)
  );

  await writeFile(outputPath, `${JSON.stringify(tasks, null, 2)}\n`);
  const submissionCount = tasks.reduce((count, task) => count + task.submissions.length, 0);
  console.log(`Generated ${path.relative(rootDir, outputPath)}: ${tasks.length} tasks, ${submissionCount} submissions`);

  if (unknownClients.size) {
    console.warn(`⚠ 未知 client（仍會顯示，請確認是否 typo）：${[...unknownClients].join(', ')}`);
  }
  if (missingPricing.size) {
    console.warn(`⚠ data/pricing.json 缺這些 modelId 的價格（costUsd 顯示 —）：${[...missingPricing].join(', ')}`);
  }
} catch (error) {
  console.error(`Manifest build failed: ${error.message}`);
  process.exitCode = 1;
}
