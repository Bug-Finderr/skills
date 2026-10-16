# skills

My agent skills, straight from `~/.claude/skills`. Opinionated: they encode how I work. Take them as they are or fork them.

| Skill | What it does |
|---|---|
| [`raise-pr`](skills/raise-pr/SKILL.md) | Takes a PR from proof to merge-ready: regression tests that compare old and new, parallel AI reviews, a plain-language description, optional captioned flow videos, and a loop over review comments until none are open. |
| [`codex-usage`](skills/codex-usage/SKILL.md) | Drives the OpenAI Codex CLI (`codex exec`) from Claude for second opinions, reviews and computer use, and covers the traps: the stdin hang, flags that are silently ignored, sandbox errors on Windows. |

## Install

Pick one route. Using both gives you every skill twice.

### Claude Code (plugin, gets updates)

```
/plugin marketplace add Bug-Finderr/skills
/plugin install bf@bug-finderr
```

Skills then show up as `/bf:raise-pr` and `/bf:codex-usage`, and Claude also picks them on its own when a task matches.

**Get updates automatically.** Claude Code turns auto-update off for marketplaces outside Anthropic's own, so switch it on once:

- In a session, run `/plugin`, open **Marketplaces**, select `bug-finderr`, then **Enable auto-update**.
- Or, in `~/.claude/settings.json`, add `"autoUpdate": true` to the `bug-finderr` entry that `marketplace add` wrote under `extraKnownMarketplaces`:

  ```json
  "bug-finderr": {
    "source": { "source": "github", "repo": "Bug-Finderr/skills" },
    "autoUpdate": true
  }
  ```

After that, Claude Code checks in the background within about ten minutes of your first message in a session. When something changed you'll see `Plugin updated: bf · Run /reload-plugins to apply`. Every commit to `main` counts as a new version.

To update by hand instead: `claude plugin update bf@bug-finderr`.

### Other agents (Cursor, Codex, Windsurf, and more)

```
npx skills@latest add Bug-Finderr/skills -g
```

This route has no update notices. Run `npx skills@latest update -g` now and then.

## Requirements

- `raise-pr`: the GitHub CLI (`gh`), and the [Codex CLI](https://github.com/openai/codex) for the second review.
- `raise-pr` videos: Node, Google Chrome, `playwright-core` in bun's cache (`bun add -g playwright-core`), Playwright's ffmpeg (`npx playwright-core install ffmpeg`), and Claude in Chrome to attach videos to the PR.
- `codex-usage`: the Codex CLI.

## License

[MIT](LICENSE)
