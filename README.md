# AI Arena

同一個 task，丟給不同 AI model 與 thinking effort，把產出並排對比的展示場。

純靜態網站（HTML / CSS / JS），可部署到 GitHub Pages，不需要後端。首頁不認識任何特定廠商；OpenAI、Anthropic、Google、xAI、GLM、DeepSeek、Kimi 等都由 metadata 提供。

想 fork 提交自己的 AI 產出？請看 **[CONTRIBUTING.md](CONTRIBUTING.md)**。

## 日常使用

新增 submission 時，不需要修改首頁或手動編輯 `tasks.json`：

1. 把產出放進 `tasks/<task-id>/<submission-id>/`。
2. 在同一資料夾加入一份 `submission.json`。
3. 執行 `node scripts/build-manifest.mjs` 更新 `tasks.json`。
4. 一起 commit 並 push 到 `main`。GitHub Actions 會驗證 manifest 並部署網站。

本機預覽前執行：

```bash
node scripts/build-manifest.mjs
python3 -m http.server 8000
# 開 http://localhost:8000
```

`tasks.json` 是產生檔，請勿手動維護。

## 結構

```text
.
├── index.html
├── tasks.json                         # 自動產生
├── scripts/
│   └── build-manifest.mjs
├── assets/
│   ├── app.js
│   └── style.css
└── tasks/
    └── <task-id>/
        ├── task.json                  # task 共用資料
        └── <submission-id>/
            ├── submission.json        # model / effort / runtime metadata
            └── index.html             # AI 產出
```

## 加入一個 model 結果

例如新增一個 GPT submission：

```text
tasks/spinning-cube/openai-gpt-high/
├── index.html
└── submission.json
```

`submission.json`：

```json
{
  "provider": "openai",
  "model": "GPT",
  "modelId": "<API 回傳的精確 model ID>",
  "effort": "high",
  "client": "codex",
  "author": "<你的 GitHub handle>",
  "generatedAt": "2026-06-07T12:00:00Z",
  "metrics": {
    "durationMs": 42000,
    "inputTokens": 1200,
    "outputTokens": 8400,
    "cachedInputTokens": 0
  },
  "order": 30
}
```

`client` 是產生產出的工具（`claude-code` / `codex` / `opencode` / `kiro` / `cursor` / `api`…），`author` 會在卡片上連到該 GitHub 帳號。`metrics` 與成本換算細節見 [CONTRIBUTING.md](CONTRIBUTING.md)。

可自由加入比較所需的 metadata，例如：

```json
{
  "provider": "google",
  "model": "Gemini",
  "modelId": "<exact-model-id>",
  "effort": "high",
  "temperature": 0.7,
  "seed": 42,
  "tools": [],
  "attempt": 1
}
```

產生器會保留額外欄位，因此日後可再讓 UI 顯示或用於篩選。

`effort` 是自由字串。`high`、`medium`、`low` 會使用專屬顏色，其他值仍可正常顯示，但會使用預設 badge 樣式。

## 成本與 metrics

卡片底部會顯示 **時間 / input tokens / output tokens / cost** 四格，缺的顯示 `—`。你不需要自己填錢：`build-manifest.mjs` 會用 `data/pricing.json` 的單價 × `submission.json` 的 token 數自動算出 `costUsd`（單位 USD）。

- 價格表 `data/pricing.json` 以 `modelId` 為 key，單位是 USD / 1M tokens，來源標在 `source`（openrouter / bedrock…），更新時一併更新 `verifiedAt`。
- `modelId` 不在價格表時 cost 顯示 `—`；在同一個 PR 補上該 model 價格即可。
- Claude Code 使用者可跑 `node scripts/metrics-from-claude-code.mjs <session.jsonl>` 直接產生 `metrics` 區塊。

> **安全提醒：** `task.json`、`submission.json` 和 `tasks/` 內的普通檔案都會部署成公開網站內容。不要放入 API key、token、`.env`、私人 prompt、內部 log 或其他敏感資料。

## 加入一個新 task

建立 `tasks/<task-id>/task.json`：

```json
{
  "title": "我的 task",
  "type": "iframe",
  "runtime": "webgl",
  "prompt": "給 AI 的原始 prompt……",
  "description": "這個 task 在比什麼。",
  "order": 30
}
```

再加入各 model 的 submission 資料夾即可。

`runtime` 建議使用：

| runtime | 用途 |
| --- | --- |
| `canvas` | 原生 HTML / JavaScript / Canvas |
| `webgl` | Three.js / WebGL |
| `unity` | Unity WebGL build |
| `static` | 圖片、影片或其他靜態結果 |

## Submission type

`type` 可放在 task 層作預設，或放在 `submission.json` override：

| type | 用途 | submission 欄位 |
| --- | --- | --- |
| `iframe` | HTML / Three.js / JavaScript / Unity | 預設載入同資料夾的 `index.html` |
| `image` | Blender 等靜態算圖 | `src` |
| `video` | 動畫或錄製結果 | `src`、`poster`（選填） |
| `model-viewer` | `.glb` / `.gltf` 互動模型 | `src`、`poster`（選填） |

媒體路徑以 `submission.json` 所在資料夾為基準。例如：

```json
{
  "provider": "deepseek",
  "model": "DeepSeek",
  "modelId": "<exact-model-id>",
  "type": "image",
  "src": "render.png"
}
```

外部媒體只接受 `https:` URL；`http:`、`data:`、`blob:` 等協定不會通過 manifest 產生器。

## GitHub Pages 自動部署

Repo 已包含 `.github/workflows/pages.yml`。第一次設定時：

1. 到 GitHub repo 的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. Push 到 `main`，workflow 會驗證 metadata、確認 `tasks.json` 已同步並部署。

## Unity WebGL 注意事項

- GitHub repository 一般檔案超過 100 MiB 會被阻擋；GitHub Pages 不支援 Git LFS，因此大型 build 建議放 Cloudflare Pages 或 object storage。
- Unity 預設 Brotli / Gzip build 需要正確的 `Content-Encoding` header。GitHub Pages 不支援自訂 header，可在 Unity 開啟 **Decompression Fallback**、停用壓縮，或改用可設定 headers 的 hosting。
- 現有 iframe sandbox 適合單檔 HTML / Three.js / Canvas。正式加入 Unity 或多檔 ES modules 前，需要再決定 submission 是否改放獨立 origin。
