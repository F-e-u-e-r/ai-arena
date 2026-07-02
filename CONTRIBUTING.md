# 貢獻指南

歡迎提交你用任何 AI model / client 跑出來的產出，一起擴充這個對比場。流程是 **fork → 加檔案 → 開 PR**，merge 後你的產出就會顯示在網站上，並標上你的 GitHub 名稱。

## TL;DR

1. **Fork** 這個 repo。
2. 選一個現有 task（`tasks/<task-id>/`），或[新增一個 task](#新增一個-task)。
3. 建立你的 submission 資料夾：`tasks/<task-id>/<你的-submission-id>/`
   - 放入 `index.html`（你的產出）。
   - 放入 `submission.json`（metadata，見下）。
4. 本機執行 `node scripts/build-manifest.mjs` 更新 `tasks.json`。
5. Commit（含 `tasks.json`）並開 PR。CI 會驗證，維護者 review 後 merge。

> submission-id 建議格式：`<model>-<effort>-<你的handle>`，例如 `gpt-5-high-octocat`，避免和別人撞名。

## submission.json 欄位

必填只有 `provider` 和 `model`，其餘皆選填（缺的會在網站上顯示 `—`）。

```json
{
  "provider": "openai",
  "model": "GPT-5",
  "modelId": "gpt-5",
  "effort": "high",
  "client": "codex",
  "author": "octocat",
  "generatedAt": "2026-07-02T12:00:00Z",
  "metrics": {
    "durationMs": 42000,
    "inputTokens": 1200,
    "outputTokens": 8400,
    "cachedInputTokens": 0
  },
  "order": 30
}
```

| 欄位 | 說明 |
| --- | --- |
| `provider` | **必填**。廠商小寫 id：`openai` / `anthropic` / `google` / `xai` / `deepseek`… |
| `model` | **必填**。顯示用的 model 名稱，例如 `GPT-5`、`Opus 4.8` |
| `modelId` | API 回傳的精確 model id。**用來對 `data/pricing.json` 查價算 cost**，強烈建議填 |
| `effort` | thinking effort：`high` / `medium` / `low`（自由字串，這三個有專屬顏色） |
| `client` | 產生產出的工具：`claude-code` / `codex` / `opencode` / `kiro` / `cursor` / `api`（自由字串，已知值有專屬顏色） |
| `author` | 你的 GitHub handle，網站會連到 `https://github.com/<author>` |
| `generatedAt` | ISO 8601 時間 |
| `metrics` | 見下方[如何取得 metrics](#如何取得-time--token-metrics) |
| `order` | 同一 task 內的排序（小的在前） |

### metrics 欄位

| 欄位 | 說明 |
| --- | --- |
| `durationMs` | 產出耗時（毫秒） |
| `inputTokens` | 輸入（非快取）token 數 |
| `outputTokens` | 輸出 token 數 |
| `cachedInputTokens` | 從 prompt cache 讀取的 token 數（選填，會用較低的快取單價計費） |

**cost 怎麼算？** 你**不需要**自己填錢。build script 會用 `data/pricing.json` 的單價自動算：

```
costUsd = (inputTokens × input單價 + outputTokens × output單價 + cachedInputTokens × 快取單價) / 1,000,000
```

若 `data/pricing.json` 裡沒有你的 `modelId`，cost 會顯示 `—`；歡迎在同一個 PR 順手加上該 model 的價格（標明 `source` 與 `verifiedAt`）。

## 如何取得 time / token metrics

各 client 的可取得程度不同：

| Client | Token | Time | 怎麼拿 |
| --- | --- | --- | --- |
| **Claude Code** | ✅ | ✅ | 跑 `node scripts/metrics-from-claude-code.mjs <session.jsonl>` 直接吐出 `metrics` 區塊；或用 `/cost` 看花費。Session log 在 `~/.claude/projects/<專案>/*.jsonl` |
| **Codex CLI** | ✅ | ✅ | CLI 結束時會印 token usage；用 API 時 response 的 `usage` 欄位有 input/output tokens |
| **opencode** | ✅ | ✅ | 內建 per-session 的 usage / cost 統計 |
| **Cursor** | ⚠️ 手動 | ⚠️ | 沒有官方 token 匯出，只能從後台 dashboard 估算，或留空 |
| **Kiro** | ⚠️ 手動 | ⚠️ | AWS 後台，無簡易匯出，留空即可 |

> 拿不到 metrics 也**歡迎提交** — 缺的欄位會顯示 `—`，產出本身一樣能並排對比。

## 產出（index.html）要求

- **單一 `index.html`**，自帶所有需要的東西。可用 CDN（例如 Three.js `https://unpkg.com/...`）。
- 會在 **sandbox iframe**（`allow-scripts allow-pointer-lock`）中執行，不能存取父頁面、cookie、或同源資源。
- 非 HTML 產出（圖片 / 影片 / 3D 模型）改用 `type: image | video | model-viewer`，詳見 [README](README.md)。

## 新增一個 task

建立 `tasks/<task-id>/task.json`：

```json
{
  "title": "我的 task",
  "type": "iframe",
  "runtime": "webgl",
  "prompt": "給 AI 的原始 prompt 全文……",
  "description": "這個 task 在比什麼。",
  "order": 30
}
```

`prompt` 會**完整**顯示在該 task 頁面最上方的 codeblock，所以請貼你實際餵給 model 的原文。

## ⚠️ 安全提醒

`tasks/`、`task.json`、`submission.json` 的內容都會部署成**公開**網站。**不要**放入 API key、token、`.env`、私人 prompt、內部 log 或任何敏感資料。CI 會做基本掃描，但最終責任在提交者。

## 本機驗證

```bash
node scripts/build-manifest.mjs   # 產生 tasks.json；有錯會報出來
python3 -m http.server 8000       # 開 http://localhost:8000 預覽
```

`tasks.json` 是產生檔，請 commit 但不要手改。PR CI 會重跑 build 並確認它與你 commit 的一致。
