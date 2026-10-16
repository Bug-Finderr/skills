---
name: codex-usage
description: Use when shelling out work to the OpenAI Codex CLI or gpt models via codex exec - reviews, second opinions, browser or computer use, PDFs, security scans - or when a codex run hangs, hits sandbox errors, or burns tokens on plugin skills.
---

# Codex CLI usage

Traps found on codex-cli 0.144 to 0.162. Re-check flags with `codex exec --help` when the CLI is newer.

Plain `codex exec` loads `~/.codex/config.toml` (model, reasoning, approval, sandbox, plugins), headless included. Don't add flags that override it (`--ignore-user-config`, `--ignore-rules`, `-s`, `-p`, skill disables) unless the user asks to trim a run.

## Command template

From bash (Git Bash on Windows, never `cmd /c "..."`, which splits quoted prompts into words):

```bash
codex exec --skip-git-repo-check -C "/path/to/workdir" \
  -i screenshot.png -o out.md "prompt" </dev/null 2>err.log
```

- `</dev/null` is mandatory: with an open non-TTY stdin codex prints "Reading additional input from stdin..." and waits forever.
- `-i` is repeatable for images. On Windows use `C:/...` paths.
- Long prompt: `codex exec - < prompt.txt` reads it from stdin.
- Single-quote prompts that contain `$skill` so bash doesn't expand them.
- Runs can exceed 10 minutes: run in the background and poll the `-o` file. The stderr tail has `tokens used`.
- `--json` streams JSONL events; `codex exec resume <session-id>` continues a session.

## Plugins under codex exec

Installed plugins load headless too, with skills namespaced `plugin:skill`. Trigger one by naming it in the prompt ("Use the $pdf skill to ...") or let implicit matching pick it. `codex plugin list` shows install state.

- Computer use works headless only while the ChatGPT desktop app is running; it serves the native pipe the plugin talks to. On "Computer Use native pipe is unavailable", start the ChatGPT app itself; `codex app` wrongly reports Codex Desktop missing and opens an installer. On Windows check with `[System.IO.Directory]::GetFiles('\\.\pipe\') -match 'codex-computer-use'`.
- The in-app browser plugin fails headless ("Browser is not available"). Use a Chrome-control plugin or a playwright MCP server from the codex config instead.

## Trimming a run (only when asked)

- `-c 'plugins."x@y".enabled=false'` is silently ignored. Don't rely on it.
- Plugin-free run: `--ignore-user-config -m <model>`. The whole config is dropped, including your sandbox choice, so use it only for no-tool runs (image or text reviews, pure reasoning).
- Disable one skill for one run, e.g. `using-superpowers`, which codex reads at the start of every conversation. Point at every cached copy of its SKILL.md under `~/.codex/plugins/cache`:

```bash
codex exec -c "skills.config=[{path='<cache>/<marketplace>/superpowers/<hash>/skills/using-superpowers/SKILL.md',enabled=false}]" ...
```

  Use TOML literal (single-quoted) paths. Cache paths change on plugin update, so re-check if the skill still loads.
- Permanent: `[plugins."name@marketplace"] enabled = false` in config.toml, or toggle it in the TUI under `/plugins`.

## Failure modes

- Windows with `--sandbox read-only`: "windows sandbox: helper_unknown_error: apply deny-read ACLs" and the task reports blocked. Use the config's sandbox and put read-only discipline in the prompt.
- "No such host is known" or reconnect spam to api.openai.com: a network flake. Retry once, then skip codex and say it was skipped.

## In Claude workflows and subagents

The `model` option only takes Claude models. Spawn a thin Claude wrapper that writes a self-contained prompt, runs `codex exec`, and returns a report (use `schema` for structured output). Label it with a `gpt:` prefix, e.g. `{label: 'gpt:review-auth'}`, because the workflow UI shows the wrapper's Claude model and the label is the only sign the real worker is gpt.
