import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validate } from './lib/validate-json-schema.mjs';
import { normalizePricing } from './lib/pricing.mjs';
import { isOsCruft, isSafeSegment } from './lib/publication-policy.mjs';

// ARENA_ROOT：測試 seam —— 覆寫 repo root，讓 test/publication.test.mjs 能在隔離 fixture 樹上
// 跑「真實」的 oracle（N-1/N-3 這類 loop 層整合行為，必須測真實 script 而非副本）。未設時行為
// 完全不變（預設為本 script 的 repo root）。僅 build-manifest 讀此 env；assembler 不讀（其 rootDir
// 由函式參數傳入），故此 seam 的影響面僅限於 oracle 的整合測試。
const rootDir = process.env.ARENA_ROOT
  ? path.resolve(process.env.ARENA_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasksDir = path.join(rootDir, 'tasks');
const pricingPath = path.join(rootDir, 'data', 'pricing.json');
const schemaDir = path.join(rootDir, 'schema');
// --output / --strict 於 main() 內解析（見檔尾 main-guard）。本檔被測試 import 時不解析 argv、
// 不執行 build，使 assertNoSymlinks / classifyTreeEntry 等 guard 可在各自函式邊界被單元測試。

// 已知 client 只用來提醒可能的 typo；未知值仍可正常顯示（比照 effort 的自由字串設計）。
const knownClients = new Set(['claude-code', 'codex', 'opencode', 'kiro', 'cursor', 'grok', 'api', 'other']);

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
  const models = data.models && typeof data.models === 'object' ? data.models : {};
  // 正規化：讓 aliasFor 的短 id 與 canonical id 都解析到同一份單價（見 lib/pricing.mjs）。
  return normalizePricing(models);
}

// 以名稱做決定性排序（沿用舊 directories() 的預設字串排序，讓枚舉順序與錯誤訊息決定性；
// 最終 tasks.json 另由 order/id 再排序，故迭代順序不影響輸出位元）。
function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
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
  if (!isSafeSegment(name)) {
    fail(`unsafe ${kind} 資料夾名稱 "${name}"：只允許英數字與 . _ -（且不可是 . 或 ..）`);
  }
}

// tasks/ 內不允許任何 symlink。gallery 會載入並部署整個資料夾，任何檔案
// （task.json / submission.json / index.html / main.js / 巢狀檔）若是 symlink，
// 都可能把資料夾外、未經 PR 審查的內容偷渡進 gallery。在讀取任何 metadata 前先
// 掃過整棵 tasks/ 一律擋掉，最簡單也最安全，且不影響任何正常 submission。
// Guard A（A-12/A-15）：對 tasks/ 整棵樹遞迴預掃，任何 symlink 一律 fail。於讀取任何 metadata
// 前先跑（main() 內 L~),是 symlink 的「主防線」。export 以便 N-5a 在「本函式自身邊界」單元測試：
// 真實版對含 symlink 的目錄丟出；測試內的 known-bad（移除 isSymbolicLink 檢查的本地變體）則不丟。
// 與 guard B / 組裝器 guard 各自獨立 —— 停用本防護不需、也不得弱化其他任何防護（A-12 獨立性）。
export async function assertNoSymlinks(dir) {
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

// Guard B（A-15：驗證器層的 no-follow 型別防護，與 guard A assertNoSymlinks 獨立）。判定 tasks/
// 樹某個「直接子項」是否為允許項目，對雜散檔 / 非一般檔（FIFO/socket/device）/ symlink fail-closed。
// entry 是 readdir({withFileTypes:true}) 的 Dirent —— 其型別取自目錄項本身（lstat 語義、不跟隨
// symlink）。level==='submission' 時額外允許名為 task.json 的一般檔（task 自身 metadata 與
// submission 資料夾並列）。回傳 'dir' | 'task-json'；其餘一律丟出。
// known-bad（N-5a-ii）：改以 stat（跟隨）判型，symlink→目標會被當成一般目錄而被接受——本函式
// 刻意只用 Dirent 的 no-follow 型別，故「停用此 no-follow」只牽涉本函式、不碰 guard A（A-12 獨立性）。
export function classifyTreeEntry(entry, level) {
  const name = entry.name;
  if (entry.isSymbolicLink()) {
    throw new Error(`tasks/ 內不允許 symlink：${name}`);
  }
  if (level === 'submission' && name === 'task.json' && entry.isFile()) {
    return 'task-json';
  }
  if (entry.isDirectory()) {
    return 'dir';
  }
  throw new Error(`tasks/ 內不允許雜散檔或非一般檔（${level} 層）：${name}`);
}

// 所有 media 一律指向 submission 資料夾內的檔案：不接受任何 URL scheme、
// 不接受跳出資料夾的相對路徑。symlink 逃逸由 assertNoSymlinks 統一擋下。
// 這讓「PR 看到的檔案 = gallery 實際載入的內容」對每一種 media 型別都成立。
async function resolveMediaPath(submissionDir, value, trailingSlash = false) {
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    fail(`unsupported media reference "${value}": 請改用 submission 資料夾內的檔案路徑（不接受外部 URL）`);
  }
  // media 值只允許單純的相對路徑字元（英數字與 . _ - /）。任何其他字元在磁碟上或許
  // 合法，但在瀏覽器 URL 裡可能被賦予特殊意義或正規化——# 開片段、? 開查詢、%2e 解碼成
  // 點、\ 轉成 /——都能讓通過 stat 的路徑在瀏覽器端穿越出資料夾（例如 "..#x"、"%2e%2e/x"、
  // "..\x"）。用白名單一次擋掉整個類別；真正的 ../ 穿越再交給下面的 isInsideDir。
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
    fail(`media reference 只允許英數字與 . _ - /（避免瀏覽器 URL 正規化造成路徑穿越）：${value}`);
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

// 只把 schema 認得的來源欄位投影進 manifest（保留原始欄位順序），順便濾掉純供編輯器
// 用的 "$schema" 指標，避免它漏進 tasks.json。id / costUsd / submissions 這些衍生欄位
// 由呼叫端在投影後再補上。
function projectFields(metadata, schema) {
  const props = schema.properties || {};
  const out = {};
  for (const key of Object.keys(metadata)) {
    if (key === '$schema') continue;
    if (Object.prototype.hasOwnProperty.call(props, key)) out[key] = metadata[key];
  }
  return out;
}

// 只有這三個欄位能實際換算 cost；totalTokens 只是總量、無法拆出單價。
const COSTABLE_TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cachedInputTokens'];
// gate 用的「有回報用量」判斷則納入 totalTokens：只給 totalTokens 也算「有用量卻無 cost」。
const REPORTED_TOKEN_FIELDS = [...COSTABLE_TOKEN_FIELDS, 'totalTokens'];

function hasTokens(metrics, fields) {
  return !!metrics && fields.some(k => typeof metrics[k] === 'number');
}

// 這個 modelId 是否有可用單價（input/output 皆為數字）；有就回 rates，否則 undefined。
// computeCost 與 uncosted 原因判斷共用同一份查詢，避免兩邊邏輯漂移。
function priceFor(modelId) {
  const rates = modelId ? pricing[modelId] : undefined;
  return rates && typeof rates.input === 'number' && typeof rates.output === 'number' ? rates : undefined;
}

// cost = (input·單價 + output·單價 + cached·快取價) / 1M。cached 省略單價時退回 input 價。
// 算不出來（沒可計價 token / 缺 modelId / pricing 未收錄 / 數值過大導致溢位）一律回
// undefined，由呼叫端記錄，絕不讓 Infinity 進到 manifest（JSON.stringify 會變成 null）。
function computeCost(modelId, metrics) {
  if (!hasTokens(metrics, COSTABLE_TOKEN_FIELDS)) return undefined;
  const rates = priceFor(modelId);
  if (!rates) return undefined;
  const input = metrics.inputTokens || 0;
  const output = metrics.outputTokens || 0;
  const cached = metrics.cachedInputTokens || 0;
  const cachedRate = typeof rates.cachedInput === 'number' ? rates.cachedInput : rates.input;
  const usd = (input * rates.input + output * rates.output + cached * cachedRate) / 1e6;
  return Number.isFinite(usd) ? Math.round(usd * 1e6) / 1e6 : undefined;
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
    ...projectFields(metadata, submissionSchema),
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
    else if (!priceFor(metadata.modelId)) reason = `modelId "${metadata.modelId}" 查無單價`;
    else reason = 'token 數過大導致 cost 溢位（請確認 metrics 數值）';
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
  const entries = (await readdir(taskDir, { withFileTypes: true })).sort(byName);
  for (const entry of entries) {
    if (isOsCruft(entry.name)) continue;                 // A-7：忽略本機 gitignored OS cruft（.DS_Store 等）
    const kind = classifyTreeEntry(entry, 'submission'); // guard B：雜散/非一般/symlink → fail（N-2/N-5/N-6）
    if (kind === 'task-json') continue;                  // task 自身 metadata，不是 submission
    const submissionId = entry.name;
    const submissionMetadata = path.join(taskDir, submissionId, 'submission.json');
    try {
      await stat(submissionMetadata);
    } catch {
      // 原本是 continue（靜默略過無 metadata 的目錄）；改 fail-closed（N-3）。
      fail(`${webPath(path.join(taskDir, submissionId))}: submission 目錄缺少 submission.json（不接受無 metadata 的目錄）`);
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

  return { ...projectFields(metadata, taskSchema), id, submissions };
}

// 原本是檔案頂層直接執行的 try 區塊；改包進 main()，並以檔尾 main-guard 控制「只有被當 script
// 直接執行時才跑 build」。本體邏輯不變（僅上方兩個枚舉迴圈已改 fail-closed），為最小 diff 保留原縮排。
async function main() {
  const outputArg = process.argv.indexOf('--output');
  if (outputArg !== -1 && !process.argv[outputArg + 1]) {
    throw new Error('--output requires a file path');
  }
  const outputPath = outputArg === -1
    ? path.join(rootDir, 'tasks.json')
    : path.resolve(process.cwd(), process.argv[outputArg + 1]);
  const strict = process.argv.includes('--strict');

try {
  pricing = await loadPricing();
  submissionSchema = await readJson(path.join(schemaDir, 'submission.schema.json'));
  taskSchema = await readJson(path.join(schemaDir, 'task.schema.json'));
  // 在讀取任何 task.json / submission.json 之前先擋掉 symlink，避免 readFile 跟著逃逸。
  await assertNoSymlinks(tasksDir);
  const tasks = [];
  const ids = new Set();

  const taskEntries = (await readdir(tasksDir, { withFileTypes: true })).sort(byName);
  for (const entry of taskEntries) {
    if (isOsCruft(entry.name)) continue;  // A-7：忽略本機 gitignored OS cruft
    classifyTreeEntry(entry, 'task');     // guard B：tasks/ 直接子項只能是目錄；雜散/非一般/symlink → fail（N-2/N-5/N-6）
    const taskId = entry.name;
    const metadataPath = path.join(tasksDir, taskId, 'task.json');
    try {
      await stat(metadataPath);
    } catch {
      // 原本是 continue（靜默略過無 metadata 的目錄）；改 fail-closed（N-1）。
      fail(`tasks/${taskId}: task 目錄缺少 task.json（不接受無 metadata 的目錄）`);
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
}

// main-guard：只有被當 script 直接執行（node scripts/build-manifest.mjs …）時才跑 build；
// 被測試 import 時不執行，使 assertNoSymlinks / classifyTreeEntry 等 guard 可在自身邊界被測試。
const invokedDirectly = import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href;
if (invokedDirectly) {
  await main();
}
