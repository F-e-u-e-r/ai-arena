// T3 / T4 — model-viewer SRI：真的走 assets/app.js 的 ensureModelViewer() 動態載入路徑（不是另寫一個
// loader 來測）。以 page.route 把 tasks.json 換成「含 model-viewer 型 submission」的合成 manifest（記憶體
// 內，不碰 repo、不新增 production submission），並把 unpkg 的 4.4.0 URL 以 fixture 位元組回應（離線、
// 確定性；位元組 provenance：test/fixtures/model-viewer-4.4.0.provenance.json）。瀏覽器自己對回應位元
// 組算 SRI，所以：
//   T3 正向：app.js 常數正確 → script 執行、customElements 註冊 'model-viewer'、無 integrity 錯誤、
//            只載一次（mvLoaded guard）、<model-viewer loading="lazy" reveal="interaction"> 保留。
//   T4 負向：把 app.js 回應裡的常數換成被取代的 4.3.1 digest（= URL 升到 4.4.0 但忘了更新 digest 的狀態）→ CDN
//            回應仍是 200（排除網路失敗）、但瀏覽器以 integrity 錯誤拒載：element 不註冊、script 收到 error
//            事件、console 錯誤訊息含 'integrity' 與實際位元組的 sha384。
//   T-lazy ：真實 manifest 沒有 model-viewer 型 submission → 永遠不載 model-viewer（lazy 契約）。
//   T-live ：opt-in（MODEL_VIEWER_LIVE=1）不攔 unpkg、走真網路——網路相依證據，預設 skip，不當 PASS。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const ROOT = new URL('../../', import.meta.url);
const FIXTURE = gunzipSync(readFileSync(new URL('test/fixtures/model-viewer-4.4.0.min.js.gz', ROOT)));
const PROV = JSON.parse(readFileSync(new URL('test/fixtures/model-viewer-4.4.0.provenance.json', ROOT), 'utf8'));
const APP_JS = readFileSync(new URL('assets/app.js', ROOT), 'utf8');
const SRI = APP_JS.match(/^const MODEL_VIEWER_SRI = '([^']+)';$/m)[1];
const SRC = APP_JS.match(/^const MODEL_VIEWER_SRC = '([^']+)';$/m)[1];
const FIXTURE_SRI = 'sha384-' + createHash('sha384').update(FIXTURE).digest('base64');
const WRONG_SRI = PROV.superseded_digest.value; // 被取代的 4.3.1 digest（URL 已升 4.4.0 但 digest 未更新 → 瀏覽器必須拒載）
const TASK = 'spinning-cube'; // 2 submissions → 兩張 model-viewer 卡，驗證只載一次

// 合成 manifest：取真實 manifest，把目標 task 的每個 submission 改為 model-viewer 型（src 指向 submission
// 資料夾內一個不存在的 .glb，由 route 回 404；glb 載入失敗與 SRI 無關，測試只斷言 SRI 相關條件）。
async function syntheticManifest(route) {
  const real = await (await route.fetch()).json();
  const task = real.find((t) => t.id === TASK);
  for (const s of task.submissions) { s.type = 'model-viewer'; s.src = `${s.path}model.glb`; }
  return real;
}

// cdnRequests 記錄「對 CDN URL 的請求」（不論是否得到回應），cdnStatuses 記錄其回應狀態：
// T-lazy 斷言零請求（不是只看 DOM），T3/T4/T-live 斷言恰好一次 GET。
function probes(page) {
  const consoleErrors = [];
  const cdnRequests = [];
  const cdnStatuses = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('request', (r) => { if (r.url() === SRC) cdnRequests.push(r.method()); });
  page.on('response', (r) => { if (r.url() === SRC) cdnStatuses.push(r.status()); });
  return { consoleErrors, cdnRequests, cdnStatuses };
}

// 以 capture 階段的 window 'error' 監聽器記錄資源載入錯誤（<script> 的 error 事件不會冒泡）。
async function installResourceErrorProbe(page) {
  await page.addInitScript(() => {
    window.__resourceErrors = [];
    window.addEventListener('error', (e) => {
      const t = e.target;
      if (t && t.tagName) window.__resourceErrors.push({ tag: t.tagName, src: t.src || '' });
    }, true);
  });
}

async function routeManifestAndGlb(page) {
  await page.route('**/*.glb', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/tasks.json', async (route) => {
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify(await syntheticManifest(route)),
    });
  });
}

// 以 fixture 位元組回應 CDN URL（含 CORS header：crossorigin=anonymous 的跨源 module script 需要）。
async function routeCdnWithFixture(page) {
  await page.route(SRC, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    body: FIXTURE,
  }));
}

// 負向：把真實 app.js 的回應改成「修正前」的錯誤 digest（其餘位元組不變）。
async function routeAppJsWithWrongDigest(page) {
  const mutated = APP_JS.replace(`const MODEL_VIEWER_SRI = '${SRI}';`, `const MODEL_VIEWER_SRI = '${WRONG_SRI}';`);
  expect(mutated).not.toBe(APP_JS); // 變異必須真的套上
  await page.route('**/assets/app.js*', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' },
    body: mutated,
  }));
}

const loaderScriptInfo = () => {
  const s = [...document.querySelectorAll('script[src*="model-viewer"]')];
  return s.map((x) => ({ src: x.getAttribute('src'), integrity: x.getAttribute('integrity'), crossorigin: x.getAttribute('crossorigin'), type: x.getAttribute('type') }));
};

test.beforeAll(() => {
  // 前提（失敗就是 fixture / 常數本身壞了，先於瀏覽器證據）
  expect(SRI).toBe(FIXTURE_SRI);
  expect(WRONG_SRI).not.toBe(SRI);
  expect(SRC).toBe(PROV.production_url);
});

test('T-lazy: with the real manifest (no model-viewer submission) model-viewer is never requested nor loaded', async ({ page }) => {
  const { consoleErrors, cdnRequests, cdnStatuses } = probes(page);
  await page.goto(`/#${TASK}`);
  await expect(page.locator('main h2')).toBeVisible();
  await expect(page.locator('main .placeholder')).toHaveCount(2); // 真實 2 張 iframe 卡（lazy placeholder）
  expect(await page.evaluate(loaderScriptInfo)).toEqual([]);
  expect(await page.evaluate(() => !!customElements.get('model-viewer'))).toBe(false);
  expect(cdnRequests).toEqual([]); // 零請求：不是「請求了再拿掉」
  expect(cdnStatuses).toEqual([]);
  expect(consoleErrors.filter((e) => /integrity|digest/i.test(e))).toEqual([]);
});

test('T3 (positive): the real loader path with the corrected SRI executes model-viewer (fixture bytes, offline)', async ({ page }) => {
  await installResourceErrorProbe(page);
  const { consoleErrors, cdnRequests, cdnStatuses } = probes(page);
  await routeManifestAndGlb(page);
  await routeCdnWithFixture(page);

  await page.goto(`/#${TASK}`);
  // 兩張 model-viewer 卡都渲染（lazy / reveal 屬性保留）
  await expect(page.locator('main model-viewer')).toHaveCount(2);
  await expect(page.locator('main model-viewer').first()).toHaveAttribute('loading', 'lazy');
  await expect(page.locator('main model-viewer').first()).toHaveAttribute('reveal', 'interaction');

  // HTTP 200 不等於執行成功：等到 custom element 真的註冊才算載入成功
  await page.waitForFunction(() => !!customElements.get('model-viewer'), null, { timeout: 20_000 });

  const scripts = await page.evaluate(loaderScriptInfo);
  expect(scripts).toEqual([{ src: SRC, integrity: SRI, crossorigin: 'anonymous', type: 'module' }]); // 恰好一個（mvLoaded guard）
  expect(cdnRequests).toEqual(['GET']); // 兩張卡只發一次請求
  expect(cdnStatuses).toEqual([200]);
  expect(consoleErrors.filter((e) => /integrity|digest/i.test(e))).toEqual([]);
  expect(await page.evaluate(() => window.__resourceErrors.filter((e) => /model-viewer/.test(e.src)))).toEqual([]);
});

test('T4 (negative): the pre-fix digest is rejected by the browser as an integrity failure, not a network failure', async ({ page }) => {
  await installResourceErrorProbe(page);
  const { consoleErrors, cdnRequests, cdnStatuses } = probes(page);
  await routeManifestAndGlb(page);
  await routeCdnWithFixture(page);
  await routeAppJsWithWrongDigest(page);

  await page.goto(`/#${TASK}`);
  await expect(page.locator('main model-viewer')).toHaveCount(2);

  // 瀏覽器必須以 integrity 錯誤明確拒載（Chromium："Failed to find a valid digest in the 'integrity' attribute …"）
  await expect.poll(() => consoleErrors.find((e) => /integrity/i.test(e)) || null, { timeout: 15_000 }).not.toBeNull();
  const msg = consoleErrors.find((e) => /integrity/i.test(e));
  expect(msg).toContain(SRC);
  expect(msg).toContain(FIXTURE_SRI.replace(/^sha384-/, '')); // 瀏覽器回報的「實際」sha384 = fixture 位元組的 sha384

  // 排除網路失敗：恰好一次請求且 CDN 回應是 200（位元組送達），拒載發生在 integrity 比對
  expect(cdnRequests).toEqual(['GET']);
  expect(cdnStatuses).toEqual([200]);
  // 被拒的 script 收到 error 事件；custom element 從未註冊
  await expect.poll(() => page.evaluate(() => window.__resourceErrors.filter((e) => /model-viewer/.test(e.src)).length), { timeout: 10_000 }).toBe(1);
  expect(await page.evaluate(() => !!customElements.get('model-viewer'))).toBe(false);
  const scripts = await page.evaluate(loaderScriptInfo);
  expect(scripts).toEqual([{ src: SRC, integrity: WRONG_SRI, crossorigin: 'anonymous', type: 'module' }]);
});

test('T-live [network-dependent, opt-in MODEL_VIEWER_LIVE=1]: the real CDN response satisfies the corrected SRI', async ({ page }) => {
  test.skip(!process.env.MODEL_VIEWER_LIVE, 'network-dependent evidence; run with MODEL_VIEWER_LIVE=1');
  await installResourceErrorProbe(page);
  const { consoleErrors, cdnRequests, cdnStatuses } = probes(page);
  await routeManifestAndGlb(page); // 不攔 unpkg：真網路
  await page.goto(`/#${TASK}`);
  await page.waitForFunction(() => !!customElements.get('model-viewer'), null, { timeout: 30_000 });
  expect(cdnRequests).toEqual(['GET']);
  expect(cdnStatuses).toEqual([200]);
  expect(consoleErrors.filter((e) => /integrity|digest/i.test(e))).toEqual([]);
  expect(await page.evaluate(loaderScriptInfo)).toEqual([{ src: SRC, integrity: SRI, crossorigin: 'anonymous', type: 'module' }]);
});
