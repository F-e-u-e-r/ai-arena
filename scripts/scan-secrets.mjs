// 基本祕密掃描：擋住明顯的 API key / token / 私鑰被 commit 進公開網站內容。
// 只掃貢獻者會動到的目錄（tasks/、data/），並只挑常見廠商格式，盡量零誤判。
// 本機可自行執行：node scripts/scan-secrets.mjs
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanRoots = ['tasks', 'data'];
const textExtensions = new Set(['.html', '.htm', '.json', '.js', '.mjs', '.css', '.txt', '.md', '.svg', '.xml', '.yml', '.yaml']);

const patterns = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI-style API key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS secret access key', re: /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+]{40}/i },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: 'xAI API key', re: /\bxai-[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ }
];

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // 目錄不存在就跳過
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    } else if (entry.name === '.env' || entry.name.startsWith('.env.')) {
      out.push(full); // .env 一律讀來檢查（通常根本不該存在）
    }
  }
  return out;
}

function rel(p) {
  return path.relative(rootDir, p).split(path.sep).join('/');
}

const findings = [];
for (const root of scanRoots) {
  const files = await walk(path.join(rootDir, root), []);
  for (const file of files) {
    const name = path.basename(file);
    if (name === '.env' || name.startsWith('.env.')) {
      findings.push(`${rel(file)}: 不應 commit .env 檔`);
    }
    let content;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const { name: label, re } of patterns) {
        if (re.test(line)) {
          findings.push(`${rel(file)}:${i + 1}: 疑似 ${label}`);
        }
      }
    });
  }
}

if (findings.length) {
  console.error('🚫 偵測到疑似祕密，請移除後再提交：');
  for (const f of findings) console.error(`  ${f}`);
  console.error('\n若為誤判，請調整 scripts/scan-secrets.mjs 的規則並在 PR 說明。');
  process.exitCode = 1;
} else {
  console.log('✓ 未偵測到明顯祕密');
}
