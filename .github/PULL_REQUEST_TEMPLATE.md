<!-- 感謝貢獻！請填一下這份清單，方便 review。 -->

## 這個 PR 加了什麼

- Task：<!-- 例如 spinning-cube，或「新 task: xxx」 -->
- Model / client：<!-- 例如 GPT-5 (high) via codex -->

## 檢查清單

- [ ] 在 `tasks/<task-id>/<submission-id>/` 加了 `index.html` 與 `submission.json`
- [ ] `submission.json` 有填 `provider` 與 `model`（其餘選填）
- [ ] 有填 `author`（我的 GitHub handle）
- [ ] 已在本機執行 `node scripts/build-manifest.mjs`，並一起 commit 了更新後的 `tasks.json`
- [ ] 產出是**單一 index.html**，能在 sandbox iframe 中獨立執行
- [ ] **沒有**任何 API key / token / `.env` / 私人或敏感資料

## metrics 來源（選填）

<!-- 例如：Claude Code session log / Codex CLI 輸出 / API usage / 手動估算 / 無 -->
