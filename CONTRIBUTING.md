# Contributing Guide

Language: English | [繁體中文](CONTRIBUTING.zh-TW.md)

Contributions are welcome. The usual flow is: fork the repository, add your generated output, open a pull request, and wait for review. After merge, your output appears in the gallery with your GitHub handle.

## TL;DR

1. Fork this repository.
2. Choose an existing task under `tasks/<task-id>/`, or [add a new task](#add-a-new-task).
3. Create your submission folder: `tasks/<task-id>/<your-submission-id>/`.
   - Add `index.html` for your generated output.
   - Add `submission.json` for metadata.
4. Run `node scripts/build-manifest.mjs` to update `tasks.json`.
5. Commit your files, including `tasks.json`, and open a PR. CI validates the metadata and a maintainer reviews before merge.

Recommended submission-id format: `<model>-<effort>-<yourhandle>`, for example `gpt-5-high-octocat`.

## `submission.json` Fields

Only `provider` and `model` are required. Missing optional values are shown as a dash on the site.

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

| Field | Description |
| --- | --- |
| `provider` | Required. Lowercase provider id, such as `openai`, `anthropic`, `google`, `xai`, or `deepseek`. |
| `model` | Required. Display name, such as `GPT-5` or `Opus 4.8`. |
| `modelId` | Exact model id returned by the API. Used to look up pricing in `data/pricing.json`. Strongly recommended. |
| `effort` | Thinking effort, such as `high`, `medium`, or `low`. Free-form string. |
| `client` | Tool used to generate the output, such as `claude-code`, `codex`, `opencode`, `kiro`, `cursor`, or `api`. Free-form string. |
| `author` | Your GitHub handle. The site links this to `https://github.com/<author>`. |
| `generatedAt` | ISO 8601 timestamp. Rendered in UTC before the GitHub author link. |
| `metrics` | See [metrics fields](#metrics-fields). |
| `order` | Sort order within the task. Lower values appear first. |

### Metrics Fields

| Field | Description |
| --- | --- |
| `durationMs` | Generation time in milliseconds. |
| `inputTokens` | Non-cached input tokens. |
| `outputTokens` | Output tokens. |
| `cachedInputTokens` | Optional cached-input tokens, billed at a lower cached rate when available. |

Cost is calculated automatically:

```text
costUsd = (inputTokens * input price + outputTokens * output price + cachedInputTokens * cached-input price) / 1,000,000
```

If `data/pricing.json` does not include your `modelId`, cost is shown as a dash. Add the pricing in the same PR if you can, including `source` and `verifiedAt`.

## How to Get Time and Token Metrics

| Client | Tokens | Time | How to get them |
| --- | --- | --- | --- |
| Claude Code | Yes | Yes | Run `node scripts/metrics-from-claude-code.mjs <session.jsonl>`, or use `/cost`. Session logs are usually under `~/.claude/projects/<project>/*.jsonl`. |
| Codex CLI | Yes | Yes | The CLI prints token usage at the end. API responses include a `usage` field. |
| opencode | Yes | Yes | Built-in per-session usage and cost statistics. |
| Cursor | Manual | Manual | No simple official token export; estimate from dashboard data or leave blank. |
| Kiro | Manual | Manual | Use AWS-side data where available, or leave blank. |

Metrics are optional. Submissions without metrics are still welcome.

## Output Requirements

- Prefer a single self-contained `index.html`. CDN assets are allowed, for example Three.js from `https://unpkg.com/...`.
- HTML outputs run in a sandboxed iframe with `allow-scripts allow-pointer-lock`. They cannot access the parent page, cookies, or same-origin resources.
- Non-HTML outputs should use `type: image`, `type: video`, or `type: model-viewer`. See [README.md](README.md).

## Add a New Task

Create `tasks/<task-id>/task.json`:

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

The `prompt` is shown in full on the task page. Use the actual prompt text you sent to the model.

## Security

Everything under `tasks/`, plus `task.json` and `submission.json`, is published as public website content. Do not commit API keys, tokens, `.env` files, private prompts, internal logs, or other sensitive data. CI runs a basic scan, but contributors are responsible for what they submit.

## Local Validation

```bash
node scripts/build-manifest.mjs
node scripts/scan-secrets.mjs
python3 -m http.server 8000
```

Then open `http://localhost:8000` and verify your output loads.

`tasks.json` is generated. Commit it, but do not edit it by hand. PR CI reruns the build and fails if the committed manifest is stale.
