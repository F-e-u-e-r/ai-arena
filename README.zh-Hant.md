# AI Arena

**同一個 prompt 的 AI 輸出並排比較——跨模型、思考強度與 client，附時間／token／成本指標。**

![status](https://img.shields.io/badge/status-LIVE-2ee6a6) [![version](https://img.shields.io/badge/version-v0.1.0-orange)](https://github.com/F-e-u-e-r/ai-arena/releases/tag/v0.1.0) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [線上 gallery →](https://f-e-u-e-r.github.io/ai-arena/) · [English](README.md) · 繁體中文

AI Arena 是一個靜態展示網站，用來比較不同 AI 模型與不同思考強度設定在同一個任務上的輸出結果。

網站只使用 HTML、CSS 與 JavaScript，因此可以直接部署到 GitHub Pages，不需要後端服務。首頁不偏向任何供應商；OpenAI、Anthropic、Google、xAI、GLM、DeepSeek、Kimi 與其他供應商都透過提交資料呈現。

想貢獻 AI 生成結果？請參考 [CONTRIBUTING.zh-Hant.md](CONTRIBUTING.zh-Hant.md)，其中包含針對 prompts、輸出與媒體的[貢獻政策](CONTRIBUTING.zh-Hant.md#貢獻政策)。英文版貢獻指南在 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 亮點

- **供應商中立、以 PR 驅動的 gallery** —— 每個任務下並排多家供應商的輸出，可依工具、模型與推理強度篩選，並依名稱或上傳時間排序；新條目透過 pull request 加入，並以貢獻者的 GitHub handle 署名。
- **零後端** —— 純 HTML、CSS 與 JavaScript 部署在 GitHub Pages；build scripts 只使用 Node 標準函式庫。
- **每張卡片都有可比較的指標** —— 時間、輸入／輸出 tokens 與成本；成本由 `data/pricing.json` 計算，缺少的值顯示為 —。
- **快速失敗的貢獻契約** —— `submission.json` 與 `task.json` 在 build 時依 JSON Schema 驗證；未知欄位、過期的 `tasks.json` 或缺少價格都會讓 CI 失敗。
- **不受信任的輸出留在沙箱內** —— 每份提交都在 sandboxed iframe 中渲染，無法存取 gallery 的 origin；PR 中審閱的檔案就是 gallery 載入的檔案。

## 日常工作流程

新增提交時，不需要手動修改首頁，也不需要手動維護 `tasks.json`：

1. 將生成結果放到 `tasks/<task-id>/<submission-id>/`。
2. 在同一個資料夾新增 `submission.json`。
3. 執行 `node scripts/build-manifest.mjs` 重新產生 `tasks.json`。
4. Commit 並 push 輸出檔案與重新產生的 manifest。GitHub Actions 會驗證 manifest 並部署網站。

本機預覽：

```bash
node scripts/build-manifest.mjs
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

`tasks.json` 是產生檔。請 commit 它，但不要手動編輯。

## 專案結構

```text
.
|-- index.html
|-- tasks.json                         # generated
|-- scripts/
|   `-- build-manifest.mjs
|-- assets/
|   |-- app.js
|   `-- style.css
`-- tasks/
    `-- <task-id>/
        |-- task.json                  # shared task metadata
        `-- <submission-id>/
            |-- submission.json        # model, effort, runtime metadata
            `-- index.html             # generated output
```

## 新增模型結果

提交範例：

```text
tasks/spinning-cube/openai-gpt-high/
|-- index.html
`-- submission.json
```

`submission.json`：

```json
{
  "provider": "openai",
  "model": "GPT",
  "modelId": "<exact model ID returned by the API>",
  "effort": "high",
  "client": "codex",
  "skills": "Nil",
  "subagents": "Nil",
  "author": "<your GitHub handle>",
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

`client` 是用來產生輸出的工具，例如 `claude-code`、`codex`、`opencode`、`kiro`、`cursor` 或 `api`。`skills` 與 `subagents` 記錄這次執行的方式：執行時掛載的 skills / 指示包，以及用來 cross-check 產出的 sub-agent 模型——填 `Nil` 表示明確未使用，不確定就省略該欄位（顯示為 —）。`generatedAt` 會以 UTC 顯示在 GitHub author 連結前，例如 `2026-07-02 18:00 @F-e-u-e-r`。更多 metrics 與成本細節請見 [CONTRIBUTING.zh-Hant.md](CONTRIBUTING.zh-Hant.md)。

未知欄位會被 build 擋下（拼錯會直接失敗，而不是被無聲忽略）。想記錄新種類的比較 metadata，請在同一個 PR 把欄位加進 `schema/submission.schema.json`——`skills` 與 `subagents` 就是這樣加入的。

`effort` 是自由格式字串。`high`、`medium`、`low` 有專用徽章顏色；其他值仍會使用預設徽章樣式。

## 成本與 Metrics

每張卡片的 footer 顯示四個可比較的用量值——時間、輸入 tokens、輸出 tokens 與成本——以及第二排的執行設定（`skills` 與 `subagents`）。缺少的值會顯示為 —。你不需要自行計算成本：`build-manifest.mjs` 會使用 `data/pricing.json` 與 `submission.json` 中的 token 數，自動產生 `costUsd`。

- `data/pricing.json` 以 `modelId` 作為 key。價格以美元計，單位為每 100 萬 tokens。變更價格時請同步更新 `source` 與 `verifiedAt`。
- 如果 `modelId` 不在 pricing 檔案中，成本會顯示為 —。可以的話，請在同一個 PR 補上該模型價格。
- Claude Code 使用者可以執行 `node scripts/metrics-from-claude-code.mjs <session.jsonl>` 產生可直接貼入的 `metrics` 區塊。

> **Metrics 完整性：** 並非每個 submission 都附有完整的時間／token metrics，部分模型也尚未收錄於 `data/pricing.json`。這些情況下，時間、token 與成本欄位會顯示為 `—`。此藝廊主要用於比較**輸出品質**；各 submission 的時間／token／成本資料**並不完整**。

安全提醒：`tasks/`、`task.json`、`submission.json` 與一般 assets 都會作為公開網站內容發布。請不要 commit API keys、tokens、`.env` 檔、私人 prompts、內部 logs 或其他敏感資料。

## 新增任務

建立 `tasks/<task-id>/task.json`：

```json
{
  "title": "My task",
  "type": "iframe",
  "runtime": "webgl",
  "prompt": "The original prompt sent to the model...",
  "description": "What this task is comparing.",
  "order": 30
}
```

建議的 `runtime` 值：

| runtime | 使用情境 |
| --- | --- |
| `canvas` | 原生 HTML、JavaScript 與 Canvas |
| `webgl` | Three.js 或 WebGL |
| `unity` | Unity WebGL builds |
| `static` | 圖片、影片或其他靜態輸出 |

## 提交類型

可以在任務層級設定 `type` 作為預設值，也可以在 `submission.json` 中覆寫。

| type | 使用情境 | submission 欄位 |
| --- | --- | --- |
| `iframe` | HTML、Three.js、JavaScript、Unity | 預設使用提交資料夾中的 `index.html` |
| `image` | 靜態渲染輸出 | `src` |
| `video` | 動畫或錄影 | `src`，可選 `poster` |
| `model-viewer` | 互動式 `.glb` 或 `.gltf` 模型 | `src`，可選 `poster` |

Media paths 會以 `submission.json` 所在位置作為相對路徑解析。範例：

```json
{
  "provider": "deepseek",
  "model": "DeepSeek",
  "modelId": "<exact-model-id>",
  "type": "image",
  "src": "render.png"
}
```

外部 media 必須使用 `https:` URLs。Manifest 產生器會拒絕 `http:`、`data:`、`blob:` 與其他 protocols。

## GitHub Pages 部署

此 repository 包含 `.github/workflows/pages.yml`，並設定為透過 GitHub Actions 部署。如果 Pages 設定需要重新建立，請使用：

1. Repository **Settings -> Pages**。
2. **Build and deployment -> Source -> GitHub Actions**。
3. Push 到 `main`。

Workflow 會驗證 metadata、確認 `tasks.json` 是最新版本、掃描明顯的 secrets，然後部署靜態網站。

## Unity WebGL 注意事項

- GitHub 會阻擋超過 100 MiB 的一般 repository 檔案。GitHub Pages 不支援 Git LFS，因此大型 builds 應使用 Cloudflare Pages 或 object storage。
- Unity Brotli 或 Gzip builds 需要正確的 `Content-Encoding` headers。GitHub Pages 不支援自訂 headers，因此請啟用 Unity 的 Decompression Fallback、停用壓縮，或改用支援自訂 headers 的 hosting。
- 目前的 iframe sandbox 適合單檔 HTML、Three.js 與 Canvas 輸出。Unity 或多檔 ES module submissions 之後可能需要另外決定 hosting 或 origin 策略。

## 授權

本 repository 的程式碼——網站、build scripts、schema 與文件——以 [MIT License](LICENSE) 發布。

`tasks/` 底下提交的 prompts、模型輸出與媒體屬於貢獻內容，MIT 授權本身並不涵蓋它們：每位貢獻者依[貢獻政策](CONTRIBUTING.zh-Hant.md#貢獻政策)授予本專案將其作為 AI Arena 及其 repository 一部分進行託管、展示與再散布的權利。第三方條款與模型供應商條款仍然適用。
