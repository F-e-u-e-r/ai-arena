// SRI（Subresource Integrity）回歸測試 — assets/app.js 以 SRI 從 unpkg 動態載入 @google/model-viewer@4.3.1。
//
// 背景：2026-07-08（843a866）把 URL 釘到 4.3.1，但 MODEL_VIEWER_SRI 取自 4.0.0 的檔案，瀏覽器自始
// 一律拒載（潛伏缺陷；沒有 submission 用到 model-viewer 所以一直沒被發現）。2026-10-27 修正。
//
// 契約（離線、零網路、確定性）：
//   SRI-1  fixture 自我一致（大小 / sha256 與 provenance 相符）——擋掉被竄改或放錯檔的 fixture。
//   SRI-2  (T1) 用 fixture「位元組」重算 sha384 比對 app.js 的常數——不是兩份硬編碼 digest 互比。
//   SRI-3  (T2) 載入路徑仍設 integrity / crossOrigin='anonymous' / type='module' / 精確釘版 URL / 單次載入 guard。
//   SRI-4  known-bad arms：每個檢查都證明「會 RED」（舊 digest、拿掉 integrity、拿掉 crossOrigin、解除釘版、拿掉 guard）。
//   SRI-5  被取代的錯誤 digest 永遠不得回流。
// fixture 位元組的來源（npm tarball = unpkg = jsDelivr，逐位元組相同）見 test/fixtures/model-viewer-4.3.1.provenance.json；
// 「瀏覽器真的載得進來」由 test/browser/model-viewer-sri.spec.mjs 證明（含負向案例）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const APP_JS = readFileSync(new URL('assets/app.js', ROOT), 'utf8');
const PROV = JSON.parse(readFileSync(new URL('test/fixtures/model-viewer-4.3.1.provenance.json', ROOT), 'utf8'));
const FIXTURE = gunzipSync(readFileSync(new URL('test/fixtures/model-viewer-4.3.1.min.js.gz', ROOT)));

// 生產端刻意載入的資源：精確釘版的 unpkg URL（與 provenance.production_url 同一字串）。
const EXPECTED_SRC = 'https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js';

export function sri384(bytes) {
  return 'sha384-' + createHash('sha384').update(bytes).digest('base64');
}

// app.js 是瀏覽器 module（有 DOM 副作用），Node 下不可 import；與 smoke.spec.mjs「mirrors CLIENT_LABELS」
// 同一慣例：以原文為準萃取載入路徑的契約。找不到就丟錯（不會因結構改變而靜默通過）。
export function extractModelViewerLoader(source) {
  const src = source.match(/^const MODEL_VIEWER_SRC = '([^']+)';$/m);
  const sri = source.match(/^const MODEL_VIEWER_SRI = '([^']+)';$/m);
  const fn = source.match(/^function ensureModelViewer\(\) \{\n([\s\S]*?)\n\}$/m);
  if (!src || !sri || !fn) throw new Error('model-viewer loader (MODEL_VIEWER_SRC / MODEL_VIEWER_SRI / ensureModelViewer) not found in source');
  return { src: src[1], sri: sri[1], body: fn[1] };
}

export function checkModelViewerLoader(source) {
  const { src, sri, body } = extractModelViewerLoader(source);
  const problems = [];
  if (src !== EXPECTED_SRC) problems.push(`src is not the intended version-pinned CDN URL: ${src}`);
  if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(sri)) problems.push(`sri is not a well-formed sha384 SRI token: ${sri}`);
  if (!/^\s*s\.src = MODEL_VIEWER_SRC;$/m.test(body)) problems.push('loader does not use MODEL_VIEWER_SRC');
  if (!/^\s*s\.integrity = MODEL_VIEWER_SRI;$/m.test(body)) problems.push('loader does not set integrity (SRI enforcement removed)');
  if (!/^\s*s\.crossOrigin = 'anonymous';$/m.test(body)) problems.push("loader does not set crossOrigin = 'anonymous'");
  if (!/^\s*s\.type = 'module';$/m.test(body)) problems.push("loader does not set type = 'module'");
  if (!/^\s*if \(mvLoaded\) return;$/m.test(body)) problems.push('single-load guard (if (mvLoaded) return) missing');
  return { src, sri, problems };
}

// 套用一個必須「真的有作用」的變異：取代前後必須不同，否則 known-bad arm 會空轉而假通過。
function mutate(source, from, to) {
  const out = source.replace(from, to);
  assert.notEqual(out, source, `mutation did not apply: ${String(from).slice(0, 60)}`);
  return out;
}

test('SRI-1: fixture is self-consistent with its provenance record (size + sha256)', () => {
  assert.equal(PROV.package, '@google/model-viewer');
  assert.equal(PROV.version, '4.3.1');
  assert.equal(PROV.production_url, EXPECTED_SRC);
  assert.equal(FIXTURE.length, PROV.size_bytes, 'gunzipped fixture size must equal the recorded artifact size');
  assert.equal(createHash('sha256').update(FIXTURE).digest('hex'), PROV.sha256, 'fixture sha256 must equal the recorded artifact sha256');
});

test('SRI-2 (T1): sha384 recomputed from the fixture bytes equals MODEL_VIEWER_SRI in assets/app.js', () => {
  const computed = sri384(FIXTURE);
  const { sri } = extractModelViewerLoader(APP_JS);
  assert.equal(sri, computed, 'app.js SRI must be the sha384 of the exact 4.3.1 dist/model-viewer.min.js bytes');
  assert.equal(PROV.sri_sha384, computed, 'provenance record must agree with the recomputed digest');
  assert.equal(PROV.sri_sha512, 'sha512-' + createHash('sha512').update(FIXTURE).digest('base64'));
});

test('SRI-3 (T2): the loader keeps integrity + crossOrigin=anonymous + type=module + exact pinned URL + single-load guard', () => {
  const r = checkModelViewerLoader(APP_JS);
  assert.deepEqual(r.problems, []);
  assert.equal(r.src, EXPECTED_SRC);
  assert.match(r.src, /@4\.3\.1\/dist\/model-viewer\.min\.js$/);
});

test('SRI-4: known-bad arms — every check above can actually fail', () => {
  const { sri } = extractModelViewerLoader(APP_JS);
  const srcLine = `const MODEL_VIEWER_SRC = '${EXPECTED_SRC}';`;

  // (a) T1 oracle discriminates: the superseded digest (sha384 of the 4.0.0 file) must NOT equal the fixture digest.
  const bad = mutate(APP_JS, `const MODEL_VIEWER_SRI = '${sri}';`, `const MODEL_VIEWER_SRI = '${PROV.superseded_digest.value}';`);
  assert.notEqual(extractModelViewerLoader(bad).sri, sri384(FIXTURE));
  assert.deepEqual(checkModelViewerLoader(bad).problems, [], 'a well-formed but wrong digest is caught by SRI-2, not by the shape check');

  // (b) integrity removed → SRI enforcement gone → RED.
  const noIntegrity = mutate(APP_JS, /^\s*s\.integrity = MODEL_VIEWER_SRI;\n/m, '');
  assert.ok(checkModelViewerLoader(noIntegrity).problems.some((p) => /integrity/.test(p)));

  // (c) crossOrigin removed → RED (SRI on a cross-origin script requires CORS mode).
  const noCors = mutate(APP_JS, /^\s*s\.crossOrigin = 'anonymous';\n/m, '');
  assert.ok(checkModelViewerLoader(noCors).problems.some((p) => /crossOrigin/.test(p)));

  // (d) version un-pinned (floating unpkg URL) → RED.
  const floating = mutate(APP_JS, srcLine, "const MODEL_VIEWER_SRC = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';");
  assert.ok(checkModelViewerLoader(floating).problems.some((p) => /pinned/.test(p)));

  // (e) single-load guard removed → RED.
  const noGuard = mutate(APP_JS, /^\s*if \(mvLoaded\) return;\n/m, '');
  assert.ok(checkModelViewerLoader(noGuard).problems.some((p) => /guard/.test(p)));

  // (f) loader deleted outright → extractor throws (never a silent pass).
  const gone = mutate(APP_JS, /^function ensureModelViewer\(\) \{\n[\s\S]*?\n\}$/m, '');
  assert.throws(() => checkModelViewerLoader(gone), /not found/);
});

test('SRI-5: the superseded (4.0.0-derived) digest never comes back', () => {
  const { sri } = extractModelViewerLoader(APP_JS);
  assert.notEqual(sri, PROV.superseded_digest.value);
  assert.notEqual(sri384(FIXTURE), PROV.superseded_digest.value);
  assert.doesNotMatch(APP_JS, /sr9b4Ux0WhAUGclJ0ym0FSY2zSOMmNSn0bP\/SA0e6bNCrpn\/5W3QL8mm\+LdlQMKw/);
});

// SRI-6（網路相依、opt-in）：provenance 不只是「寫在檔案裡的宣稱」——以 MODEL_VIEWER_LIVE=1 執行時，從
// 生產 URL（unpkg）與獨立分發路徑（jsDelivr）下載，逐位元組（大小 + sha256）比對 fixture，並確認
// 200 / 無轉址 / JavaScript Content-Type，且其 sha384 等於 app.js 的常數。預設 skip（不當 PASS）：
// 離線單元測試不得發外部請求（Owner 契約）。tarball 本身的 sha512 需要整包 tarball，不在離線範圍。
test('SRI-6 [network-dependent, opt-in MODEL_VIEWER_LIVE=1]: live unpkg + jsDelivr bytes == fixture bytes',
  { skip: !process.env.MODEL_VIEWER_LIVE && 'network-dependent evidence; run with MODEL_VIEWER_LIVE=1' },
  async () => {
    const { sri } = extractModelViewerLoader(APP_JS);
    for (const url of [PROV.verified_sources.unpkg, PROV.verified_sources.jsdelivr]) {
      const res = await fetch(url, { redirect: 'manual', cache: 'no-store' });
      assert.equal(res.status, 200, `${url}: expected 200 with no redirect`);
      assert.match(res.headers.get('content-type') || '', /javascript/i, `${url}: Content-Type`);
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.equal(bytes.length, FIXTURE.length, `${url}: size`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), PROV.sha256, `${url}: sha256 == fixture/provenance`);
      assert.equal(sri384(bytes), sri, `${url}: sha384 == MODEL_VIEWER_SRI`);
    }
    assert.equal(PROV.verified_sources.unpkg, EXPECTED_SRC, 'the live-checked unpkg URL is the production URL');
  });
