---
name: codex-usage
description: Use when sending work to the codex CLI - second opinions, code reviews, image generation, bulk file work.
---

# Codex CLI usage

Checked on codex-cli 0.166; `codex exec --help` covers newer versions and the rest.

Use codex wherever a different model family or a separate context helps, giving it the material, not your conclusion. It reads images with `-i`, generates images, and reads PDFs and office files when a document plugin is installed (`codex plugin list`). Runs take 15 seconds to several minutes, so batch questions into one run.

## How

Run from bash, not `cmd /c`, and always pass the model and reasoning effort:

```bash
codex exec --skip-git-repo-check -C "/path/to/workdir" -m <model> -c model_reasoning_effort=high \
  -o out.md "prompt" -i screenshot.png </dev/null 2>err.log
```

- Without `</dev/null`, codex hangs on "Reading additional input from stdin...".
- `-i` takes several values, so a prompt right after it is read as an image: put the prompt first, or use `-i img.png -- "prompt"`.
- `-o` holds the answer and is written only when the run ends.
- A typo in reasoning effort fails only after about a minute (server 400).
- Code review, from inside the repo: `codex exec review --uncommitted -m <model> -c model_reasoning_effort=high -o review.md </dev/null`. These flags refuse a prompt, and review has no `-C`.

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

Their `model` takes only Claude models, so spawn a thin Claude wrapper that runs codex in a background shell or with a multi-minute timeout (the 2-minute default kills it before `-o` is written), waits for it to exit and returns the `-o` file. err.log stays flat while codex works, so it shows no progress. Label the wrapper `gpt:...` so the workflow UI shows the real worker.
