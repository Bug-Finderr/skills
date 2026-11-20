---
name: codex-usage
description: Use when sending work to the codex CLI - second opinions, code reviews, image generation, bulk file work.
---

# Codex CLI usage

Use codex wherever a different model family or a separate context helps, giving it the material, not your conclusion. It generates images, and reads PDFs and office files when a document plugin is installed (`codex plugin list`). A run takes 15 seconds to several minutes, so batch questions into one run.

## How

Run from bash, not `cmd /c`, and always pass the model and reasoning effort:

```bash
codex exec --skip-git-repo-check -C "/path/to/workdir" -m <model> -c model_reasoning_effort=high \
  -o answer-<sha>-<time>.md "prompt" -i screenshot.png </dev/null 2>err.log
```

- Without `</dev/null`, codex hangs on "Reading additional input from stdin...".
- A prompt right after `-i` is read as an image: put the prompt first, or use `-i img.png -- "prompt"`.
- `-o` is written only when the run ends; read it only after codex exits.
- Give every run its own `-o` file: a reused name hands back an earlier answer when a run fails.
- When you run codex yourself, use the Bash tool's `run_in_background`, never inside `timeout`, which kills it mid-run. Wait for the exit notice; no sleep or polling loops.
- A typo in reasoning effort fails only after about a minute (server 400).
- Code review, from inside the repo (review has no `-C`) and with no prompt: `codex exec review --uncommitted` (or `--base main`, or `--commit <sha>`) `-m <model> -c model_reasoning_effort=high -o review-<sha>-<time>.md </dev/null`.
- A review that needs a brief, such as PR text, is a plain `codex exec -s read-only` run whose prompt names the head commit and the diff command (`git diff main...<sha>`).
- Read-only has no network: save the PR text to a file first (`gh pr view <n> --json title,body`) and name that file in the prompt.

## Plugins

Plugins from `~/.codex/config.toml` load headless; name a skill in the prompt to use it ("Use the $pdf skill to ..."; single-quote it in bash).

- `-c 'plugins."x@y".enabled=false'` does nothing.
- To drop one skill for one run, pass the absolute path of its SKILL.md under `~/.codex/plugins/cache`:

  ```bash
  codex exec -c "skills.config=[{path='<absolute path>/SKILL.md',enabled=false}]" ...
  ```

- A wrong path is ignored silently; ask codex to list its skills to check.
- Permanently: `[plugins."name@marketplace"] enabled = false` in config.toml.

## Failure modes

- With `--ignore-user-config` on Windows, shell commands came back "blocked by policy" while the run still exited 0.
- "No such host is known" from api.openai.com: retry once, then skip codex and say so.

## From Claude workflows and subagents

Their `model` takes only Claude models, so spawn Haiku that runs codex in the foreground with the Bash tool's 10-minute timeout and returns its own `-o` file. A subagent's turn ends before a background exit notice arrives. Label the wrapper `gpt:...`.
