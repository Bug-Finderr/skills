---
name: codex-usage
description: Use when sending work to the codex CLI - second opinions, code reviews, image generation, bulk file work.
---

# Codex CLI usage

Use codex wherever a different model family or a separate context helps, giving it the material, not your conclusion. It reads images with `-i`, generates images, and reads PDFs and office files when a document plugin is installed (`codex plugin list`). Runs take 15 seconds to several minutes, so batch questions into one run.

## How

Run from bash, not `cmd /c`, and always pass the model and reasoning effort:

```bash
codex exec --skip-git-repo-check -C "/path/to/workdir" -m <model> -c model_reasoning_effort=high \
  -o answer-<sha>-<time>.md "prompt" -i screenshot.png </dev/null 2>err.log
```

- Without `</dev/null`, codex hangs on "Reading additional input from stdin...".
- `-i` takes several values, so a prompt right after it is read as an image: put the prompt first, or use `-i img.png -- "prompt"`.
- `-o` holds the answer and is written only when the run ends. Give every run its own file, named after the commit and the time, and read it only after codex exits: a reused name hands back an earlier answer when a run fails or is read early.
- When you run codex yourself, start it with the Bash tool's `run_in_background`, never inside `timeout`, which kills it mid-run. The exit notice is the only sign it is done; no sleep or polling loops.
- A typo in reasoning effort fails only after about a minute (server 400).
- Code review, from inside the repo: `codex exec review --uncommitted` (or `--base main`, or `--commit <sha>`) `-m <model> -c model_reasoning_effort=high -o review-<sha>-<time>.md </dev/null`. These take no prompt, and review has no `-C`.
- A review that needs a brief, such as a PR with its text, is a plain `codex exec -s read-only` run whose prompt names the head commit and the git commands that show the change (`git diff main...<sha>`). Read-only has no network, so save the PR text to a file first (`gh pr view <n> --json title,body`) and name that file in the prompt.

## Plugins

Plugins from `~/.codex/config.toml` load headless; name a skill in the prompt to use it ("Use the $pdf skill to ..."; single-quote it in bash).

- `-c 'plugins."x@y".enabled=false'` does nothing.
- To drop one skill for one run, pass the absolute path of its SKILL.md under `~/.codex/plugins/cache`. A wrong path is ignored silently, so ask codex to list its skills to check:

  ```bash
  codex exec -c "skills.config=[{path='<absolute path>/SKILL.md',enabled=false}]" ...
  ```

- Permanently: `[plugins."name@marketplace"] enabled = false` in config.toml.

## Failure modes

- `--ignore-user-config` skips config.toml. On Windows, shell commands then came back "blocked by policy" while the run still exited 0. Check the answer, not just the exit code.
- "No such host is known" from api.openai.com: retry once, then skip codex and say so.

## From Claude workflows and subagents

Their `model` takes only Claude models, so spawn Haiku that runs codex in the foreground with the Bash tool's 10-minute timeout, since a subagent's turn ends before a background exit notice arrives, then returns its own `-o` file. Label the wrapper `gpt:...` so the workflow UI shows the real worker.
