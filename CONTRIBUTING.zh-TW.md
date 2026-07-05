# 貢獻指南

語言：[English](CONTRIBUTING.md) | 繁體中文

歡迎貢獻。一般流程是：fork repository、新增你的生成輸出、開 pull request，然後等待 review。Merge 之後，你的輸出會和你的 GitHub handle 一起出現在 gallery。

## TL;DR

1. Fork 這個 repository。
2. 選擇 `tasks/<task-id>/` 底下既有任務，或[新增任務](#新增任務)。
3. 建立你的提交資料夾：`tasks/<task-id>/<your-submission-id>/`。
   - 加入 `index.html` 作為生成輸出。
   - 加入 `submission.json` 作為 metadata。
4. 執行 `node scripts/build-manifest.mjs` 更新 `tasks.json`。
5. Commit 你的檔案，包含 `tasks.json`，並開 PR。CI 會驗證 metadata，maintainer 會在 merge 前 review。

建議的 submission-id 格式：`<model>-<effort>-<yourhandle>`，例如 `gpt-5-high-octocat`。

## `submission.json` 欄位

只有 `provider` 與 `model` 是必填。缺少的選填值會在網站上顯示為 —。

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
| `provider` | 必填。小寫供應商 id，例如 `openai`、`anthropic`、`google`、`xai` 或 `deepseek`。 |
| `model` | 必填。顯示名稱，例如 `GPT-5` 或 `Opus 4.8`。 |
| `modelId` | API 回傳的精確 model id。用來在 `data/pricing.json` 查詢價格。強烈建議填寫。 |
| `effort` | 思考強度，例如 `high`、`medium` 或 `low`。自由格式字串。 |
| `client` | 用來產生輸出的工具，例如 `claude-code`、`codex`、`opencode`、`kiro`、`cursor` 或 `api`。自由格式字串。 |
| `author` | 你的 GitHub handle。網站會連到 `https://github.com/<author>`。 |
| `generatedAt` | ISO 8601 timestamp。會以 UTC 顯示在 GitHub author 連結前。 |
| `metrics` | 請見 [metrics 欄位](#metrics-欄位)。 |
| `order` | 任務內排序。數值越小越前面。 |

### Metrics 欄位

| 欄位 | 說明 |
| --- | --- |
| `durationMs` | 生成時間，單位為毫秒。 |
| `inputTokens` | 非 cached 的輸入 tokens。 |
| `outputTokens` | 輸出 tokens。 |
| `cachedInputTokens` | 可選的 cached-input tokens，若供應商支援，通常以較低 cached rate 計費。 |

成本會自動計算：

```text
costUsd = (inputTokens * input price + outputTokens * output price + cachedInputTokens * cached-input price) / 1,000,000
```

如果 `data/pricing.json` 不包含你的 `modelId`，成本會顯示為 —。可以的話，請在同一個 PR 補上價格，包含 `source` 與 `verifiedAt`。

## 如何取得時間與 Token Metrics

| Client | Tokens | Time | 取得方式 |
| --- | --- | --- | --- |
| Claude Code | 自動 | 自動 | 執行 `node scripts/metrics-from-claude-code.mjs <session.jsonl>`，或使用 `/cost`。Session logs 通常在 `~/.claude/projects/<project>/*.jsonl`。 |
| Codex CLI | 自動 | 自動 | CLI 會在結束時印出 token usage。API responses 包含 `usage` 欄位。 |
| opencode | 自動 | 自動 | 內建 per-session 的 usage 與 cost 統計。 |
| Cursor | 需手動 | 需手動 | 沒有簡單的官方 token 匯出；可從後台 dashboard 估算，或留空。 |
| Kiro | 需手動 | 需手動 | 從 AWS 後台取得，若無則留空。 |

Metrics 是選填。沒有 metrics 的 submissions 仍然歡迎。

## 輸出需求

- 優先使用單一 self-contained `index.html`。允許 CDN assets，例如從 `https://unpkg.com/...` 載入 Three.js。
- HTML outputs 會在 sandboxed iframe 中執行，權限為 `allow-scripts allow-pointer-lock`。它們不能存取 parent page、cookies 或 same-origin resources。
- 非 HTML outputs 應使用 `type: image`、`type: video` 或 `type: model-viewer`。請見 [README.zh-TW.md](README.zh-TW.md)。

## 新增任務

建立 `tasks/<task-id>/task.json`：

```json
{
  "title": "My task",
  "type": "iframe",
  "runtime": "webgl",
  "prompt": "The full original prompt sent to the model...",
  "description": "What this task compares.",
  "order": 30
}
```

`prompt` 會完整顯示在任務頁面。請使用你實際送給模型的 prompt 文字。

## 安全性

`tasks/` 底下的所有內容，以及 `task.json` 與 `submission.json`，都會作為公開網站內容發布。請不要 commit API keys、tokens、`.env` 檔、私人 prompts、內部 logs 或其他敏感資料。CI 會執行基本掃描，但 contributors 仍需自行負責提交內容。

## 本機驗證

```bash
node scripts/build-manifest.mjs
node scripts/scan-secrets.mjs
python3 -m http.server 8000
```

接著開啟 `http://localhost:8000`，確認你的輸出能正確載入。

`tasks.json` 是產生檔。請 commit 它，但不要手動編輯。PR CI 會重新執行 build，如果 committed manifest 已過期就會失敗。
