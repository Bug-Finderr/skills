---
name: ui-pass
description: Use when setting up or running a UI and UX polish or redesign pass across many screens of a web app with the user in the loop, even if they only say "UI pass", "polish the whole UI", "design round" or ask how to start one. Not for a fix to one screen or component.
---

# UI pass

Project rules and the user's own words win where they differ. Script usage, config and traps are in `reference.md`.
- One screen or component is not a pass: check it at phone and laptop width and stop.

## Setup: nothing changes yet
- Research every rule and skill that touches UI (file and line), the live UI and real-visitor vitals, and outside methods with evidence they beat a plain prompt.
- Publish one designed page: polish or redesign, decisions with your recommendation each, the user's three gates (pick a direction, approve the pilot, final review), scoring, keep/edit/cut per rule, and skills on, name-only or off. Then stop.
- Apply what the user approves: UI rules in one path-scoped rules file (extend the project's own); skills that contradict the look off, style skills name-only.
- Settings, skill switches and hooks may not apply until a reload or a new session: say so and stop until they do.
- Point to design guides, never summarise them: the `AGENTS.md` of each guide in this skill's `guides/` when present, and any the project names.
- Finish and report the phase in hand; a later step the user mentions is not a go-ahead.

## Tooling, before any change
- Inventory every screen, overlay and state at phone and laptop width (a reader per area plus a completeness critic) into the screen list.
- Fixtures fill the local backend with every state through the app's own functions, refuse non-local targets, and rerun before every full capture.
- Capture the before set on main; watch the first 50 shots for systematic failures, fix and restart.
- A lint hook flags what the project's rules ban.
- A state file holds the checklist, decisions, known false positives and a timestamped log, so a killed step resumes from disk.

## Rounds
- Polish keeps layout, copy meaning, art and motion: a direction from 3-4 static renders, then one built pilot on every kind of page it touches, public ones included.
- Design rounds offer 3-4 options that differ in idea, at least one bold; motion reaches the user as clips first.
- Judge every option against both taste files, cut the weak ones and recommend your own pick.
- Ask on a picks page (`scripts/picks`): each option has a visual, a one-line consequence and your pick, with its open state inside it; remove stale ones.
- Build only what the user picked, on every instance of that element; "answered" ends a round.
- Each round ends with gates, blind judging, reviews and a report with the one decision needed.

## Judging
- `ui-check.mjs` passes on every changed screen; read its 44px warnings, console errors and 2x crops yourself.
- Critics judge blind (`scripts/judge`) on main reshot beside the branch with the same data: unlabelled crops in both orders plus an identical control, and no brief, notes or taste file. Muse Wonder first at xhigh (never max), then gpt-6.1-sol; Opus flags but never votes.
- A change passes when it wins both orders; revert only what lost. No 1-10 scores: they drift.
- Critics check motion clips only for overlap, clipping and lag; motion taste is the user's.
- At most two critic rounds per screen: keep the best, and rewrite the prompt after two failed fixes.
- Check verdicts against the user's dated quotes afterwards; a change against one waits for the user.
- Before and after on the user's pages compare against the previous round, cropped to the change.

## Taste
- Read `taste.md` and the project's taste file before proposing, building or reviewing.
- During a pass `taste.md` stays read-only; a pick goes into the project's taste file only when it holds for other screens, never a rule from one pick.
- At the end of a pass, list the project lessons that would hold anywhere, ask which to promote, and add the approved ones to the user's own copy of `taste.md` without repeating a line.
- One-screen decisions live in code and checks.

## Running long
- Items on different files code in parallel in throwaway worktrees with no dev server; one capture agent shoots them all; merge each lane when it ends and branch the next from the fresh pass branch.
- Each agent writes to its own output set; long jobs run in the background with a notification, never a polling loop.
- Never idle on an outside wait while independent work exists.
- Restart whatever the memory reaper kills; keep unused dev servers off.
- Unattended agents avoid commands that need approval (write to a new folder instead of deleting) and undo with `git revert`.
- The real phone is the user's own browser: ask first, check its screen, clear only localhost cookies.

## Ending
- Check every answer on every picks page against the code; later work overwrites approved picks.
- Park ideas the user liked but didn't use (stills, clips, art, code, their words, why) before deleting a round's files.
- A final cut must shrink the diff and prove nothing moved: paired reduced-motion shots of old and new code (`scripts/diff.sh`), motion recorded old against new with frames that change (`scripts/motion`), and a list of what was not recorded.
