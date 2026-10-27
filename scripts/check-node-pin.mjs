// Node 版本釘住（.node-version）的陳舊偵測 —— 唯讀、不需任何 token、絕不部署（Workstream E3，2026-10-27）。
//
// 背景：CI 以 `.node-version` 單一來源精確釘住 Node patch（Owner 決策：可重現性優先，不用 setup-node check-latest；
// 見 .github/workflows/pages.yml）。Dependabot 不會維護這個值，所以用本腳本在排程 workflow
// （.github/workflows/node-pin-check.yml，每週一次 + 手動）比對官方釋出資料，落後就以非零結束讓該 run 變紅。
//
// 資料來源只用官方：
//   - https://nodejs.org/dist/index.json                          （所有釋出：version / date / security / lts）
//   - https://raw.githubusercontent.com/nodejs/Release/main/schedule.json （nodejs/Release WG 的 LTS 時程：maintenance / end）
// 任一來源不可用、回應非 200、或釘住值不在官方清單 → 丟錯（fail closed；不會「查不到就當成最新」）。
//
// 分類（classifyPin，純函式、可離線單元測試；test/node-pin-check.test.mjs 含 known-bad 臂）：
//   current               釘住值 == 同主版本線的最新釋出                       → exit 0
//   patch-drift           同主版本線有更新 patch（回報是否含 security 釋出）     → exit 1（::error）
//   major-line-migration  釘住的主版本線已 EOL（today >= schedule.end）         → exit 1（::error）
//   advisory（不改變結束碼）主版本線處於 Maintenance（只收安全修補）→ ::notice；EOL 在 90 天內 → ::warning
// 「patch drift」與「major-line migration」刻意分開：前者是例行維護（改 .node-version 一行），後者是需要 Owner
// 決策的遷移（本 workstream 明示不得靜默從 22 升 24）。
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_INDEX_URL = 'https://nodejs.org/dist/index.json';
export const SCHEDULE_URL = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';
export const EOL_WARN_DAYS = 90;
const FETCH_TIMEOUT_MS = 20_000;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .node-version 只接受精確的 X.Y.Z（去頭尾空白）；"22"、"22.23"、"v22.23.4"、"lts/*" 一律拒絕——
// 範圍或別名會讓同一個 commit 在不同日期跑到不同 Node（正是本契約要排除的）。
export function parsePinned(text) {
  const v = String(text).trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`.node-version 必須是精確的 X.Y.Z（目前："${v}"）`);
  }
  return v;
}

export function cmpSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// ISO 日期（YYYY-MM-DD）嚴格解析：格式正確且真實存在（round-trip 相等，擋 2027-13-01 / 2027-02-30 這類會被
// Date 正規化或變成 NaN 的值）。無效 → 丟錯（fail closed）。審查 F1：未驗證的 NaN 比較會讓所有分支為假、
// 靜默落到 current（fail-open）。
export function parseIsoDate(s, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error(`${label} 必須是 YYYY-MM-DD（目前："${s}"）`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new Error(`${label} 不是有效日期（目前："${s}"）`);
  }
  return d;
}

function dayDiff(later, earlier) {
  return Math.round((later - earlier) / 86_400_000);
}

// index：nodejs.org/dist/index.json 的陣列；schedule：schedule.json 物件；today：'YYYY-MM-DD'（可注入以便測試）。
export function classifyPin({ pinned, index, schedule, today }) {
  if (!Array.isArray(index) || !index.length) throw new Error('釋出索引不是非空陣列（來源異常，fail closed）');
  if (!schedule || typeof schedule !== 'object') throw new Error('時程資料不是物件（來源異常，fail closed）');
  const t = parseIsoDate(today, 'today');
  const major = Number(pinned.split('.')[0]);
  const line = index
    .filter((r) => typeof r.version === 'string' && new RegExp(`^v${major}\\.\\d+\\.\\d+$`).test(r.version))
    .map((r) => ({ version: r.version.slice(1), date: r.date, security: r.security === true }))
    .sort((a, b) => cmpSemver(b.version, a.version));
  if (!line.length) throw new Error(`官方釋出索引內找不到 v${major}.x 任何釋出（來源異常，fail closed）`);
  if (!line.some((r) => r.version === pinned)) {
    throw new Error(`釘住的 ${pinned} 不在官方 v${major}.x 釋出清單中（來源異常或 .node-version 錯字，fail closed）`);
  }
  const sched = schedule[`v${major}`];
  if (!sched || sched.end === undefined) throw new Error(`時程資料缺 v${major}.end（來源異常，fail closed）`);
  const end = parseIsoDate(sched.end, `schedule v${major}.end`);
  // 合理性界限（審查 Grok F7 → R2 F4：schedule.json 取自可變分支、無 digest；且不得因缺 start 就跳過）：
  //   (1) start 必須存在（缺少 → fail closed）；
  //   (2) start 必須與「官方釋出索引中該主版本線最早一筆釋出的日期」相符（±14 天）—— 兩個官方來源交叉驗證，
  //       單獨竄改 schedule.json（把 start/end 一起往後搬）會被 index.json 拆穿；
  //   (3) start→end 跨度須在 [600, 1300] 天內（Node 釋出政策下每條主版本線約 36 個月）。
  // 三者任一不成立 → 丟錯（fail closed），不讓「無限延後的 end」靜默壓掉 major-line-migration 訊號。
  if (sched.start === undefined) throw new Error(`時程資料缺 v${major}.start（來源異常，fail closed）`);
  const start = parseIsoDate(sched.start, `schedule v${major}.start`);
  const lineDates = line.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))).sort();
  if (!lineDates.length) throw new Error(`官方釋出索引內 v${major}.x 釋出缺日期（來源異常，fail closed）`);
  const lineStart = parseIsoDate(lineDates[0], `index v${major}.x earliest release date`);
  if (Math.abs(dayDiff(start, lineStart)) > 14) {
    throw new Error(`schedule v${major}.start=${sched.start} 與官方釋出索引最早釋出日 ${lineDates[0]} 不符（來源不一致，fail closed）`);
  }
  const span = dayDiff(end, start);
  if (span < 600 || span > 1300) throw new Error(`schedule v${major} start→end 跨度 ${span} 天不合理（來源異常，fail closed）`);
  const maint = sched.maintenance === undefined || sched.maintenance === null
    ? null : parseIsoDate(sched.maintenance, `schedule v${major}.maintenance`);
  const latest = line[0].version;
  const newer = line.filter((r) => cmpSemver(r.version, pinned) > 0);
  const daysToEol = dayDiff(end, t);
  const base = {
    pinned, major, latest, newer: newer.map((r) => r.version), securityBehind: newer.some((r) => r.security),
    eol: sched.end, daysToEol, advisories: [],
  };
  // EOL 當天即視為 EOL（today >= end；fail closed）。審查 F1：舊版只在 daysToEol < 0 才判，與註解矛盾。
  if (daysToEol <= 0) {
    return { ...base, category: 'major-line-migration', exit: 1 };
  }
  if (daysToEol <= EOL_WARN_DAYS) {
    base.advisories.push({ level: 'warning', message: `Node v${major} 將於 ${sched.end} EOL（剩 ${daysToEol} 天）—— 請規劃主版本線遷移（Owner 決策，非例行 patch 維護）` });
  }
  if (maint && dayDiff(t, maint) >= 0) {
    const activeLts = Object.entries(schedule)
      .filter(([k, s]) => /^v\d+$/.test(k) && Number(k.slice(1)) > major && s.lts
        && dayDiff(t, parseIsoDate(s.lts, `schedule ${k}.lts`)) >= 0
        && (!s.maintenance || dayDiff(t, parseIsoDate(s.maintenance, `schedule ${k}.maintenance`)) < 0))
      .map(([k]) => k);
    base.advisories.push({ level: 'notice', message: `Node v${major} 處於 Maintenance（自 ${sched.maintenance}，只收安全修補）${activeLts.length ? `；目前 Active LTS：${activeLts.join(', ')}` : ''}` });
  }
  if (newer.length) {
    return { ...base, category: 'patch-drift', exit: 1 };
  }
  return { ...base, category: 'current', exit: 0 };
}

export function formatReport(r) {
  const lines = [`.node-version 釘住 ${r.pinned}；官方 v${r.major}.x 最新 ${r.latest}；EOL ${r.eol}（${r.daysToEol} 天後）`];
  if (r.category === 'current') lines.push(`::notice::node-pin-check: current — ${r.pinned} 是 v${r.major}.x 線的最新釋出`);
  if (r.category === 'patch-drift') {
    lines.push(`::error::node-pin-check: patch-drift — .node-version=${r.pinned} 落後 v${r.major}.x 最新 ${r.latest}（更新：${r.newer.join(', ')}；含 security 釋出：${r.securityBehind ? '是' : '否'}）。例行維護：更新 .node-version 一行並開 PR。`);
  }
  if (r.category === 'major-line-migration') {
    lines.push(`::error::node-pin-check: major-line-migration — Node v${r.major} 已於 ${r.eol} EOL。這不是 patch 維護：需要 Owner 決策遷移主版本線。`);
  }
  for (const a of r.advisories) lines.push(`::${a.level}::node-pin-check: ${a.message}`);
  return lines.join('\n');
}

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status !== 200) throw new Error(`${url} 回應 ${res.status}（預期 200，不跟隨轉址；fail closed）`);
  return res.json();
}

async function main() {
  const pinned = parsePinned(readFileSync(path.join(rootDir, '.node-version'), 'utf8'));
  const [index, schedule] = await Promise.all([fetchJson(RELEASE_INDEX_URL), fetchJson(SCHEDULE_URL)]);
  const today = new Date().toISOString().slice(0, 10);
  const result = classifyPin({ pinned, index, schedule, today });
  console.log(formatReport(result));
  process.exitCode = result.exit;
}

// main-guard（與 build-manifest / assemble-site 同慣例：realpath 兩側，symlinked 調用路徑不致靜默跳過）。
function invokedDirectly() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || '');
  } catch {
    return false;
  }
}
if (invokedDirectly()) {
  try {
    await main();
  } catch (err) {
    console.error(`::error::node-pin-check: ${err.message}`);
    process.exitCode = 1;
  }
}
