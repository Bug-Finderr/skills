# skills

My agent skills, straight from `~/.claude/skills`. Opinionated: they encode how I work. Take them as they are or fork them.

| Skill | What it does |
|---|---|
| [`raise-pr`](skills/raise-pr/SKILL.md) | Takes a PR from proof to merge-ready: regression tests that compare old and new, parallel AI reviews, a plain-language description, optional captioned flow videos, and a loop over review comments until none are open. |
| [`ui-pass`](skills/ui-pass/SKILL.md) | Runs a UI and UX polish or redesign pass with the user in the loop only where it counts: research and a setup page before any change, picks pages for every decision, blind critics, gates on every screen, and a final cut checked pixel by pixel. Ships scripts for screen shots, blind judging, picks pages and motion recording. |
| [`codex-usage`](skills/codex-usage/SKILL.md) | Drives the OpenAI Codex CLI (`codex exec`) from Claude for second opinions, code reviews, image reading and document work, and covers the traps: the stdin hang, image flags that swallow the prompt, flags that are silently ignored, and runs that look finished before they are. |

## Install

Pick one route. Using both gives you every skill twice.

### Claude Code (plugin, gets updates)

```
/plugin marketplace add Bug-Finderr/skills
/plugin install bf@bug-finderr
```

Skills then show up as `/bf:raise-pr`, `/bf:codex-usage` and `/bf:ui-pass`, and Claude also picks them on its own when a task matches.

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

- `raise-pr`: the GitHub CLI (`gh`) with the [gh-pr-review](https://github.com/agynio/gh-pr-review) extension, and the [Codex CLI](https://github.com/openai/codex) for the second review.
- `raise-pr` videos: Node, Google Chrome, `playwright-core` in bun's cache (`bun add -g playwright-core`) and Playwright's ffmpeg (`npx playwright-core install ffmpeg`).
- `codex-usage`: the Codex CLI.
- `ui-pass`: Node, Google Chrome, `playwright` and `@axe-core/playwright` installed in the project, ImageMagick 7, ffmpeg with ffprobe, Playwright's video encoder (`npx playwright install ffmpeg`), an OpenRouter key for the Muse Wonder judge, and the Codex CLI for the gpt judge.
- `ui-pass` guides: do your own UI and UX research first (layout, states, copy, motion) and save each guide as a folder with an `AGENTS.md` in `skills/ui-pass/guides/`, which git ignores. With the plugin install, updates replace that folder, so keep guides elsewhere and name them in your project's UI rules. `taste.md` is my taste; fork the repo to keep yours.

## License

[MIT](LICENSE)
