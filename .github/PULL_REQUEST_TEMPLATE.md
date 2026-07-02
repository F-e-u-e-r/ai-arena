<!-- Thanks for contributing. Please fill out this checklist to make review easier. -->

## What This PR Adds

- Task: <!-- for example: spinning-cube, or "new task: xxx" -->
- Model / client: <!-- for example: GPT-5 (high) via codex -->

## Checklist

- [ ] I added files under `tasks/<task-id>/<submission-id>/`
- [ ] I included `index.html` or the correct media file for the submission type
- [ ] I included `submission.json`
- [ ] `submission.json` includes `provider` and `model`
- [ ] I included `author` with my GitHub handle
- [ ] I ran `node scripts/build-manifest.mjs`
- [ ] I committed the updated `tasks.json`
- [ ] The output runs independently in the sandboxed iframe, or uses a supported media type
- [ ] I did not include API keys, tokens, `.env` files, private prompts, logs, or other sensitive data

## Metrics Source

<!-- Optional. For example: Claude Code session log, Codex CLI output, API usage, manual estimate, or none. -->
