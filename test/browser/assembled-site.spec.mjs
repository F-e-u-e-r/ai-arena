// P-6（WS5-A Packet A rev.3 §6.1）：直接由「組裝後的 _site」起 static-server 跑一次瀏覽器 smoke，
// 直接覆蓋組裝產物（補足 P-5 的「位元相同子集」論證，改以實地渲染觀測）。與既有 smoke.spec.mjs
// （服務 repo root）互補：本 spec 以 ARENA_SITE_ROOT 指向組裝器產出的暫存 _site、另起一個 server。
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleSite } from '../../scripts/assemble-site.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.P6_PORT || 8211); // 刻意避開 playwright.config 的 8188（repo-root server）
const BASE = `http://localhost:${PORT}`;

let server;
let siteDir;

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* 尚未起來 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`static-server (assembled _site) did not come up at ${url}`);
}

test.describe('P-6: assembled _site renders the gallery (direct coverage of the assembled artifact)', () => {
  test.beforeAll(async () => {
    siteDir = mkdtempSync(path.join(tmpdir(), 'p6-site-'));
    const { expected } = await assembleSite({ rootDir: ROOT, outDir: siteDir });
    expect(expected.length).toBe(407); // 先確認組裝產物就是那 407 檔
    server = spawn('node', [path.join(ROOT, 'test', 'browser', 'static-server.mjs')], {
      env: { ...process.env, ARENA_SITE_ROOT: siteDir, PORT: String(PORT) },
      stdio: 'ignore',
    });
    await waitForServer(`${BASE}/index.html`);
  });

  test.afterAll(() => {
    if (server) server.kill();
    if (siteDir) rmSync(siteDir, { recursive: true, force: true });
  });

  test('index + manifest load from _site, task nav populates, submission cards render', async ({ page }) => {
    await page.goto(`${BASE}/#savannah-ecosystem`);
    await expect(page.locator('#task-list a').first()).toBeVisible();  // 由組裝後的 tasks.json 產生的 task 導覽
    await page.locator('.card').first().waitFor();                     // 選定 task 的 submission 卡片渲染
    expect(await page.locator('.card').count()).toBeGreaterThan(0);
    // tasks.json 確實由組裝後的 _site 供應（非 repo root），且為 5 個 task。
    const manifestTaskCount = await page.evaluate(async () => {
      const r = await fetch('tasks.json', { cache: 'no-cache' });
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.tasks || []);
      return arr.length;
    });
    expect(manifestTaskCount).toBe(5);
  });
});
