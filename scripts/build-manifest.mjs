import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
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

// targetPath 是否落在 parentDir 之內（含 parentDir 本身）。用「路徑分段」判斷，
// 而不是字串 startsWith('..')，才不會把 ..foo 這種合法檔名誤判成逃逸。
function isInsideDir(parentDir, targetPath) {
  const rel = path.relative(parentDir, targetPath);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

// task / submission 的資料夾名稱會直接變成 URL 的 path segment（也是 hash id）。
// 只允許英數字與 . _ -，並排除 . 與 ..，避免像 %2e%2e、..\other 這種名稱被瀏覽器
// URL 正規化成路徑穿越、逃出預期的資料夾。所有現有資料夾名稱都符合這個規則。
function assertSafeName(name, kind) {
  if (name === '.' || name === '..' || !/^[A-Za-z0-9._-]+$/.test(name)) {
    fail(`unsafe ${kind} 資料夾名稱 "${name}"：只允許英數字與 . _ -（且不可是 . 或 ..）`);
  }
}

// tasks/ 內不允許任何 symlink。gallery 會載入並部署整個資料夾，任何檔案
// （task.json / submission.json / index.html / main.js / 巢狀檔）若是 symlink，
// 都可能把資料夾外、未經 PR 審查的內容偷渡進 gallery。在讀取任何 metadata 前先
// 掃過整棵 tasks/ 一律擋掉，最簡單也最安全，且不影響任何正常 submission。
async function assertNoSymlinks(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`tasks/ 內不允許 symlink：${webPath(full)}`);
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(full);
    }
  }
}

// 所有 media 一律指向 submission 資料夾內的檔案：不接受任何 URL scheme、
// 不接受跳出資料夾的相對路徑。symlink 逃逸由 assertNoSymlinks 統一擋下。
// 這讓「PR 看到的檔案 = gallery 實際載入的內容」對每一種 media 型別都成立。
async function resolveMediaPath(submissionDir, value, trailingSlash = false) {
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    fail(`unsupported media reference "${value}": 請改用 submission 資料夾內的檔案路徑（不接受外部 URL）`);
  }
  // 反斜線與百分比編碼在 POSIX 上是合法檔名字元，但瀏覽器 URL 會把 \ 正規化成 /、
  // 把 %2e/%2f 正規化成 ./ /，變成繞過分段檢查的路徑穿越（..\x、%2e%2e/x）。
  // 一律拒絕，強制用單純的 "/" 分隔相對路徑。
  if (/[\\%]/.test(value)) {
    fail(`media reference 不可含反斜線或百分比編碼（瀏覽器可能正規化成路徑穿越）：${value}`);
  }
  const absolutePath = path.resolve(submissionDir, value);
  if (!isInsideDir(submissionDir, absolutePath)) {
    fail(`media escapes the submission folder: ${value}`);
  }
  const stats = await stat(absolutePath).catch(() => fail(`missing media: ${value}`));
  // 只有目標是資料夾時才補結尾斜線（iframe 載入整個資料夾）；指向檔案就保持檔案 URL，
  // 避免 path:"index.html" 變成 "…/index.html/" 這種指錯的目錄式 URL。
  return webPath(absolutePath, trailingSlash && stats.isDirectory());
}

// 依 schema/*.json 做宣告式驗證（required / type / enum / minimum...），
// 把原本散在各處的手寫檢查收斂到單一份規格，並給貢獻者逐條錯誤訊息。
function validateAgainstSchema(schema, data, label) {
  const errors = validate(schema, data);
  if (errors.length) {
    fail(`${label}:\n  - ${errors.join('\n  - ')}`);
  }
}

// 只有這三個欄位能實際換算 cost；totalTokens 只是總量、無法拆出單價。
const COSTABLE_TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cachedInputTokens'];
// gate 用的「有回報用量」判斷則納入 totalTokens：只給 totalTokens 也算「有用量卻無 cost」。
const REPORTED_TOKEN_FIELDS = [...COSTABLE_TOKEN_FIELDS, 'totalTokens'];

function hasTokens(metrics, fields) {
  return !!metrics && fields.some(k => typeof metrics[k] === 'number');
}

// cost = (input·單價 + output·單價 + cached·快取價) / 1M。cached 省略單價時退回 input 價。
// 算不出來（沒可計價 token / 缺 modelId / pricing 未收錄）一律回 undefined，由呼叫端記錄。
function computeCost(modelId, metrics) {
  if (!hasTokens(metrics, COSTABLE_TOKEN_FIELDS)) return undefined;
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
  assertSafeName(submissionId, 'submission');
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
  } else if (hasTokens(metadata.metrics, REPORTED_TOKEN_FIELDS)) {
    // 有回報用量卻算不出 cost，記下確切原因讓 --strict 能擋，避免成本欄無聲變 —。
    let reason;
    if (!metadata.modelId) reason = '缺 modelId';
    else if (!hasTokens(metadata.metrics, COSTABLE_TOKEN_FIELDS)) reason = '只提供 totalTokens，缺 input/output tokens';
    else reason = `modelId "${metadata.modelId}" 查無單價`;
    uncosted.add(`${label}（${reason}）`);
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
  assertSafeName(taskId, 'task');
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
  // 在讀取任何 task.json / submission.json 之前先擋掉 symlink，避免 readFile 跟著逃逸。
  await assertNoSymlinks(tasksDir);
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
