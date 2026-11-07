---
name: raise-pr
description: Use when opening, updating a pull request, reviewing a branch before merge, writing PR text, handling review or bot comments on an open PR, or when the user asks for PR videos, screen recordings or demo clips, even if they only say "pr", "push", "open the PR", "review this", "resolve comments" or "update the PR".
---

# Raise a PR

Project rules and recent merged PRs win where they differ from this.

## Prove
- Start from latest main; check new migration numbers and file names against main and open PRs.
- Test everything this change can make worse, old against new, at realistic scale; a smoke test only proves it runs.
- Judge against real data with independent references, never samples you made, and plant a change to prove each comparison can fail.
- Show a bug or hole on the base before showing it fixed, with every legitimate use still served.
- Any bug found means fixing every instance of its pattern.
- Agent-written tests stay local; their results go in the description.

## Review
- Own checks green, then a clean Opus agent and gpt-6.1-sol (codex) in parallel on the full diff and the PR text.
- Lenses: what can break in production, code nothing needs, and project and user rules.
- Refute each finding against the code before applying; keep anything uncertain on security. Re-review the fix commits.
- Keep the diff small: repeated lines become one helper, no copies of what git holds, no nice-to-haves.

## Describe
For a smart reader new to the codebase. Title says the effect; open with what breaks without it. Then only what applies: change, how it was tested (before and after table, data source), prod safety, to make it live (steps and who; merging often changes nothing), known limits, videos. Only facts checked this session, else "configured but untested". No em dashes, filler, Co-Authored-By or "Generated with". Update the body whenever a fix changes a fact. Self-assign.

## Videos (user-facing flows only)
`scripts/vlib.mjs` with Node, not Bun; start from `scripts/example-flow.mjs`. Local dev, seeded accounts signed in the way the seed file or project docs say, setup outside the recording, one caption per step, 20 to 60 s, under 10 MB, check with `scripts/sheet.mjs`, undo test data, re-record if the UI changes. Put `![](./flow.mp4)` where it belongs in the body file; `gh pr edit <n> --body-file body.md --attach flow.mp4` uploads it and swaps in the link.

## Comments until clean
Bots re-review every push, so loop: list unresolved threads, sort each, batch fixes into one push, reply to and resolve every thread, wait for the re-review.
- Threads go through the `gh pr-review` extension (`gh extension install agynio/gh-pr-review`), each with `-R owner/repo`: `threads list <n> --unresolved`, `comments reply --pr <n> --thread-id <id> --body ...`, `threads resolve --pr <n> --thread-id <id>`.
- After each push, wait for CI with one background `gh pr checks <n> --watch --fail-fast`, never a sleep-and-poll loop.

| Comment | Action |
|---|---|
| Real defect | Fix; reply with the commit and anything fixed beyond the ask |
| Wording or docs | Apply if correct |
| Asks for tests | Decline; point to the results in the description |
| Over-protective or out of scope | Decline in one line |
| Repeat of a declined point | Point to the earlier answer |

Done when every PR has zero open threads, a passing AI review on the latest head and green CI. Never merge. Report the links, what each fixes, what reviews caught or were declined, diff size, anything untested, and who does what after merge.
