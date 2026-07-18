# AI Arena

Language: English | [繁體中文](README.zh-TW.md)

AI Arena is a static gallery for comparing outputs from different AI models and thinking-effort settings on the same task.

The site is pure HTML, CSS, and JavaScript, so it can be deployed directly to GitHub Pages without a backend. The homepage is provider-neutral; OpenAI, Anthropic, Google, xAI, GLM, DeepSeek, Kimi, and other providers are represented through submission metadata.

Want to contribute an AI-generated result? See [CONTRIBUTING.md](CONTRIBUTING.md). Traditional Chinese contribution notes are available in [CONTRIBUTING.zh-TW.md](CONTRIBUTING.zh-TW.md).

## Daily Workflow

You do not need to edit the homepage or manually maintain `tasks.json` when adding a submission:

1. Put the generated output in `tasks/<task-id>/<submission-id>/`.
2. Add a `submission.json` file in the same folder.
3. Run `node scripts/build-manifest.mjs` to regenerate `tasks.json`.
4. Commit and push the output plus the regenerated manifest. GitHub Actions validates the manifest and deploys the site.

For local preview:

```bash
node scripts/build-manifest.mjs
python3 -m http.server 8000
# Open http://localhost:8000
```

`tasks.json` is generated. Commit it, but do not edit it by hand.

## Project Structure

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

## Add a Model Result

Example submission:

```text
tasks/spinning-cube/openai-gpt-high/
|-- index.html
`-- submission.json
```

`submission.json`:

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

`client` is the tool used to generate the output, such as `claude-code`, `codex`, `opencode`, `kiro`, `cursor`, or `api`. `skills` and `subagents` record how the run was conducted: the skills / instruction packs mounted during the run, and the sub-agent models used to cross-check the output — use `Nil` to state explicitly that none were used, or omit the field when unknown (shown as a dash). `generatedAt` is rendered in UTC before the GitHub author link, for example `2026-07-02 18:00 @F-e-u-e-r`. See [CONTRIBUTING.md](CONTRIBUTING.md) for metrics and cost details.

Unknown fields are rejected by the build (so typos fail fast instead of being silently ignored). To record a new kind of comparison metadata, add the field to `schema/submission.schema.json` in the same PR — that is how `skills` and `subagents` were introduced.

`effort` is a free-form string. `high`, `medium`, and `low` have dedicated badge colors; other values still render with the default badge style.

## Cost and Metrics

Each card's footer shows four comparable usage values — time, input tokens, output tokens, and cost — plus a second row with the run configuration (`skills` and `subagents`). Missing values are displayed as a dash. You do not need to calculate cost yourself: `build-manifest.mjs` uses `data/pricing.json` plus the token counts in `submission.json` to generate `costUsd`.

- `data/pricing.json` is keyed by `modelId`. Prices are in USD per 1 million tokens. Update `source` and `verifiedAt` when changing prices.
- If a `modelId` is not in the pricing file, cost is shown as a dash. Add that model's pricing in the same PR if possible.
- Claude Code users can run `node scripts/metrics-from-claude-code.mjs <session.jsonl>` to generate a ready-to-paste `metrics` block.

> **Metrics completeness:** Not every submission ships full time/token metrics, and some models are not yet in `data/pricing.json`. For those, the time, token, and cost cells show a dash (`—`). Treat the gallery primarily as a comparison of **output quality** — the per-submission time / token / cost data is **not comprehensive**.

Security note: files under `tasks/`, `task.json`, `submission.json`, and regular assets are published as public website content. Do not commit API keys, tokens, `.env` files, private prompts, internal logs, or other sensitive data.

## Add a New Task

Create `tasks/<task-id>/task.json`:

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

Recommended `runtime` values:

| runtime | Use case |
| --- | --- |
| `canvas` | Native HTML, JavaScript, and Canvas |
| `webgl` | Three.js or WebGL |
| `unity` | Unity WebGL builds |
| `static` | Images, videos, or other static outputs |

## Submission Types

Set `type` at the task level as the default, or override it in `submission.json`.

| type | Use case | submission fields |
| --- | --- | --- |
| `iframe` | HTML, Three.js, JavaScript, Unity | Defaults to `index.html` in the submission folder |
| `image` | Static render output | `src` |
| `video` | Animation or recording | `src`, optional `poster` |
| `model-viewer` | Interactive `.glb` or `.gltf` model | `src`, optional `poster` |

Media paths are resolved relative to the `submission.json` file. Example:

```json
{
  "provider": "deepseek",
  "model": "DeepSeek",
  "modelId": "<exact-model-id>",
  "type": "image",
  "src": "render.png"
}
```

External media must use `https:` URLs. `http:`, `data:`, `blob:`, and other protocols are rejected by the manifest builder.

## GitHub Pages Deployment

The repository includes `.github/workflows/pages.yml` and is configured to deploy with GitHub Actions. If the Pages settings ever need to be recreated, use:

1. Repository **Settings -> Pages**.
2. **Build and deployment -> Source -> GitHub Actions**.
3. Push to `main`.

The workflow validates metadata, confirms that `tasks.json` is current, scans for obvious secrets, and deploys the static site.

## Unity WebGL Notes

- GitHub blocks regular repository files larger than 100 MiB. GitHub Pages does not support Git LFS, so large builds should use Cloudflare Pages or object storage.
- Unity Brotli or Gzip builds require correct `Content-Encoding` headers. GitHub Pages does not support custom headers, so enable Unity's Decompression Fallback, disable compression, or use hosting that supports custom headers.
- The current iframe sandbox is suitable for single-file HTML, Three.js, and Canvas outputs. Unity or multi-file ES module submissions may need a separate hosting/origin decision later.
