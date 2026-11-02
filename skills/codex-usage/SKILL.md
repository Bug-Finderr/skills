---
name: codex-usage
description: Use when sending work to the OpenAI Codex CLI or gpt models through codex exec - second opinions, code reviews, reading screenshots or images, PDFs and office files, bulk file work - or when a codex run hangs, ignores a flag, fails on its reasoning setting, or burns tokens on plugin skills.
---

# Codex CLI usage

Checked on codex-cli 0.166; re-check with `codex exec --help` on newer versions.

## When

A different model family catches what a same-model reviewer misses. Use codex for:

- An independent review of a diff, plan or judgement call. Give it the code, not your conclusion.
- Reading images (`-i`).
- PDFs and office files, when a document plugin is installed (`codex plugin list`).
- Bulk file work outside your own context.

Runs take 15 seconds to several minutes; batch questions into one run.

## How

Plain `codex exec` loads `~/.codex/config.toml` (model, sandbox, plugins). Pass model and reasoning effort explicitly. Run from bash, not `cmd /c`:

```bash
codex exec --skip-git-repo-check -C "/path/to/workdir" -m <model> -c model_reasoning_effort=high \
  -o out.md "prompt" -i screenshot.png </dev/null 2>err.log
```

- `</dev/null` is required, or codex waits forever on stdin ("Reading additional input from stdin...").
- `-i` takes several values: a prompt right after it is read as an image. Put the prompt first, or use `-i img.png -- "prompt"`.
- `-o` gets the final message, written only when the run ends. Read the answer there.
- Long prompt: `codex exec - < prompt.txt`.
- JSON answer: `--output-schema schema.json`.
- A typo in reasoning effort fails only after about a minute (server 400).
- Code review, from inside the repo: `codex exec review --uncommitted -m <model> -c model_reasoning_effort=high -o review.md </dev/null` (or `--base <branch>`, `--commit <sha>`). These flags refuse a prompt, and review has no `-C`.
- `codex exec resume <session-id>` continues a session.

## Plugins

Plugins load headless; name a skill in the prompt to use it ("Use the $pdf skill to ..."; single-quote it in bash).

- `-c 'plugins."x@y".enabled=false'` does nothing.
- To drop one skill for one run, pass the absolute path of its SKILL.md under `~/.codex/plugins/cache` as a single-quoted TOML string. A wrong path is ignored silently, so ask codex to list its skills to check:

  ```bash
  codex exec -c "skills.config=[{path='<absolute path>/SKILL.md',enabled=false}]" ...
  ```

- Permanent: `[plugins."name@marketplace"] enabled = false` in config.toml.

## Failure modes

- `--ignore-user-config` skips config.toml. On Windows, shell commands then came back "blocked by policy" while the run still exited 0. Check the answer, not just the exit code.
- "No such host is known" from api.openai.com: retry once, then skip codex and say so.

## From Claude workflows and subagents

`model` takes only Claude models, so spawn a thin Claude wrapper that writes the prompt, runs codex in a background shell or with a multi-minute shell timeout (the 2-minute default kills it before `-o` is written), waits for the process to exit, and returns the `-o` file. err.log stays flat while codex works, so it is no sign of progress. Label the wrapper `gpt:...` so the workflow UI shows the real worker.
