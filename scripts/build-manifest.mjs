import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './lib/validate-json-schema.mjs';

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
const schemaDir = path.join(rootDir, 'schema');
const strict = process.argv.includes('--strict');

// 已知 client 只用來提醒可能的 typo；未知值仍可正常顯示（比照 effort 的自由字串設計）。
const knownClients = new Set(['claude-code', 'codex', 'opencode', 'kiro', 'cursor', 'api', 'other']);

let pricing = {};
let submissionSchema;
let taskSchema;
const uncosted = new Set();
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

function webPath(absolutePath, trailingSlash = false) {
  const relative = path.relative(rootDir, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`media path escapes the repository: ${absolutePath}`);
  }
  const result = relative.split(path.sep).join('/');
  return trailingSlash ? `${result.replace(/\/$/, '')}/` : result;
}

// 所有 media 一律指向 submission 資料夾內的實體檔案：不接受任何 URL scheme、
// 不接受跳出資料夾的相對路徑，也不接受用 symlink 逃逸。這讓「PR 看到的檔案 =
// gallery 實際載入的內容」對每一種 media 型別都成立（不只 iframe）。
async function resolveMediaPath(submissionDir, value, trailingSlash = false) {
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    fail(`unsupported media reference "${value}": 請改用 submission 資料夾內的檔案路徑（不接受外部 URL）`);
  }
  const absolutePath = path.resolve(submissionDir, value);
  const relToSubmission = path.relative(submissionDir, absolutePath);
  if (relToSubmission.startsWith('..') || path.isAbsolute(relToSubmission)) {
    fail(`media escapes the submission folder: ${value}`);
  }
  await stat(absolutePath).catch(() => fail(`missing media: ${value}`));
  // 解析掉 symlink 後再確認實體目標仍在資料夾內，擋掉 evil -> /etc/passwd 這類逃逸。
  const realTarget = await realpath(absolutePath);
  const realSubmission = await realpath(submissionDir);
  if (path.relative(realSubmission, realTarget).startsWith('..')) {
    fail(`media escapes the submission folder via symlink: ${value}`);
  }
  return webPath(absolutePath, trailingSlash);
}

// 依 schema/*.json 做宣告式驗證（required / type / enum / minimum...），
// 把原本散在各處的手寫檢查收斂到單一份規格，並給貢獻者逐條錯誤訊息。
function validateAgainstSchema(schema, data, label) {
  const errors = validate(schema, data);
  if (errors.length) {
    fail(`${label}:\n  - ${errors.join('\n  - ')}`);
  }
}

function hasTokenMetrics(metrics) {
  return !!metrics && ['inputTokens', 'outputTokens', 'cachedInputTokens']
    .some(k => typeof metrics[k] === 'number');
}

// cost = (input·單價 + output·單價 + cached·快取價) / 1M。cached 省略單價時退回 input 價。
// 算不出來（沒 token / 缺 modelId / pricing 未收錄）一律回 undefined，由呼叫端記錄。
function computeCost(modelId, metrics) {
  if (!hasTokenMetrics(metrics)) return undefined;
  const rates = modelId ? pricing[modelId] : undefined;
  if (!rates || typeof rates.input !== 'number' || typeof rates.output !== 'number') {
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

  validateAgainstSchema(submissionSchema, metadata, label);
  if (metadata.client && !knownClients.has(metadata.client)) unknownClients.add(metadata.client);

  const type = metadata.type || task.type || 'iframe';

  const submission = {
    ...metadata,
    id: metadata.id || submissionId
  };

  const cost = computeCost(metadata.modelId, metadata.metrics);
  if (cost !== undefined) {
    submission.costUsd = cost;
  } else if (hasTokenMetrics(metadata.metrics)) {
    // 有 token 卻算不出 cost：modelId 拼錯、缺 modelId、或 pricing 未收錄都算，
    // 記下來讓 --strict 能擋，避免成本欄無聲變 —。
    uncosted.add(metadata.modelId
      ? `${label}（modelId "${metadata.modelId}" 查無單價）`
      : `${label}（缺 modelId）`);
  }

  if (type === 'iframe') {
    // iframe 一律以 repo 內的檔案為準。禁止 src，否則它會在 UI 蓋掉 path
    // （app.js 的 renderMedia），讓 PR reviewer 看到的檔案 ≠ gallery 實際載入的內容，
    // 繞過本專案的祕密掃描與協定白名單。改用資料夾內的 index.html 或明確的 path。
    if (metadata.src) {
      fail(`${label}: iframe submission must not set "src"; put files in the folder or use "path"`);
    }
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
  // 先做 schema 驗證再取用欄位，否則 task.json 是 null / 非物件時會先丟出
  // 原始 TypeError，繞過我們給貢獻者的清楚錯誤訊息。
  validateAgainstSchema(taskSchema, metadata, webPath(metadataPath));
  const id = metadata.id || taskId;

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
  submissionSchema = await readJson(path.join(schemaDir, 'submission.schema.json'));
  taskSchema = await readJson(path.join(schemaDir, 'task.schema.json'));
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
  if (uncosted.size) {
    // 有 token metrics 卻算不出 cost → cost 欄會悄悄變 —。預設只 warn；
    // 加 --strict（例如在 CI）則直接 fail，避免成本覆蓋率無聲流失。
    const message = `這些 submission 有 token metrics 卻算不出 cost（costUsd 顯示 —）：\n  - ${[...uncosted].join('\n  - ')}`;
    if (strict) {
      console.error(`🚫 ${message}`);
      process.exitCode = 1;
    } else {
      console.warn(`⚠ ${message}`);
    }
  }
} catch (error) {
  console.error(`Manifest build failed: ${error.message}`);
  process.exitCode = 1;
}
