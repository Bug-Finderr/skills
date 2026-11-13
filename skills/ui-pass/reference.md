# UI pass reference

Script paths are relative to this skill's folder; run them from the project root with Node, not Bun.

## Install
- Node and Google Chrome; the scripts launch Chrome itself, so no Playwright browser download is needed.
- `playwright` and `@axe-core/playwright` in the folder that holds the config file or any folder above it; a git-excluded tools folder works.
- ImageMagick 7 (`magick`), ffmpeg with ffprobe and libvpx-vp9, curl, and Playwright's own encoder for motion clips (`npx playwright install ffmpeg`).
- `OPENROUTER_API_KEY` for the Muse Wonder judge, and a signed-in Codex CLI (a native binary on PATH) for the gpt judge.
- bash with `cmp` for `diff.sh` (Git Bash on Windows).

## Config
`ui-pass.config.mjs`, default export (pass another path with `--config`):
```js
export default {
  base: "http://localhost:3000",
  shots: "tools/ui-shots",            // shot sets, relative to the project root
  screens: "tools/ui-screens.json",
  async signIn(page, account) {},      // signs a fresh page in; the scripts save and renew the session
  async signedIn(page, account) {},    // optional: false fails the shot as "loaded signed out"
  async prepare(context, screen) {},   // optional: init scripts such as hiding a dev badge
};
```
- Screen entry: `id` (area first), `route`, `account` (omit when signed out), `widths` (`both`, `phone-only`, `laptop-only`) or `viewport {width, height}`, `steps` (body of `async (page, width) => {}`), `motion` (scroll through before the shot), `viewportOnly`, `permissions`, `env` (runs only with `--env <name>`), `mutates` (runs last), `skip` plus `needs` (the reason).
- A `mutates` screen changes what its next width and later runs see, so its steps or a reset script put the data back.
- Steps that sign out must contain the text `Sign out`, or ui-check reuses a dead session.
- A loading state is shot by blocking the backend's websocket in `steps`, then reloading.

## Scripts
- `scripts/ui-check.mjs [id-prefix...] [--out after] [--widths 390,1440] [--all-widths] [--reduce] [--scale 2] [--base url] [--no-shots] [--env name] [--resume] [--exact] [--keep-png]`: shots and gates per screen; `<shots>/<out>/report.json` is saved after every shot, and a failed shot leaves `<id>@<w>.fail.png`. `--resume` skips every shot that loaded, gate failures included, so retake a fixed screen by its id.
- `scripts/diff.sh <before-set-dir> <after-set-dir>`: each before shot is same, a changed-pixel count (2% fuzz), a size change or missing from the after set; writes a TSV in the after set.
- `scripts/pairs.mjs <before> <after> [id-prefix...]`: one before-over-after picture per screen for the tracker and the user, never for critics, since position gives the answer away. It skips pictures that exist, so clear its folder after a reshoot.
- `scripts/judge/judge.mjs <before> <after> [id-prefix...] --out <dir> [--judges muse,codex] [--prompt file] [--noise 1500]`: two images or two shot sets.
  - Sets are cut into viewport pieces and only the 6 phone and 4 wider pieces that changed most are judged; the rest are listed as `dropped` in `tiles.json`. Content pushed down shifts every piece below it, so crop such screens to the changed element.
  - A judge that never calls the control the same, or skips a pair, makes the run unaccepted: rerun it once, then drop it for that round and say so.
  - `--judges muse` first, then `codex` only on what Muse accepted; Muse costs about $0.12 to $0.14 per judged piece with its control.
- `scripts/picks/make.mjs <picks.json> [outDir]`: builds `index.html`, `img/`, `clips/` and `files.json`. Build inside the project or the session scratchpad, since publish sources must live there.
- `scripts/motion/record.mjs <set> [moment-prefix...] [--moments ui-pass.moments.mjs] [--dir shots] [--widths 390,1440] [--data] [--skip-done] [--list]`: each moment gives a clip, a strip every 100 ms and a reduced-motion end still. Widths 390 and 1440 only.
- `scripts/motion/compare.mjs [a=before] [b=after]`: stacks a's strip over b's per moment in `<shots>/<a>-vs-<b>/`.
- Moments file: default export, an array of `{ id, widths: [390, 1440], account?, route, data?, run(page, h) }`; `run` opens `h.base + route` itself, calls `h.start()` where the clip begins, then triggers and waits with fixed waits. `data: true` moments save or pay, so they run only with `--data`.

## Picks pages
- `picks.json`: `title`, optional `intro`, `questions` (`id` of letters, digits and `_-.:@+~`, `group`, `title`, `text`, `media`, `full`, `opts` of `{label, line, media}`, `facts`, `rec`) and `checks` (`id`, `title`, `text`, `lead`, `pairs` of before and after media, `rec`). Media is `{src, cap, phone?}`; `.webm` and `.mp4` are clips.
- Before sharing, write, read back and delete a probe record. Rename an answered question's options only after saving its answer.
- Answers are one record per question id, `{choice, note}`, in collection `picks`; read them with the ArtifactData tool and keep a copy on disk.
- Comment threads on the page are a second channel: reply, act, then resolve.
- A checks-only page is the tracker: every screen before and after.

## Hooks and devices
- Lint hook in `.claude/settings.local.json`: `PostToolUse` on `Edit|Write|MultiEdit` runs a project script that reads `tool_input.file_path` from stdin, checks only lines added against main, and exits 2 with the report on stderr. Test it by planting a violation.
- Real Android phone: `adb reverse tcp:<port> tcp:<port>` for the dev server and backend, `adb forward tcp:9222 localabstract:chrome_devtools_remote`, then `chromium.connectOverCDP("http://127.0.0.1:9222")` or the chrome-android MCP. Chrome must be in front for screenshots; USB with Stay awake is faster than wireless.
- Copy drafts: `opencode run --archived -m openrouter/meta/muse-wonder "<brief>" </dev/null`. For related asks, prime one session with the product brief and fork it per ask with `-s <id> --fork`; blind critics always get a fresh session.
- Art in a project's style: Codex image generation with the project's reference sheets on a flat magenta background, then key the magenta out and ship WebP at the displayed sizes.

## Checks critics miss
- Read crops for: theme colours only, one accent per screen; one heading style per role; panels matching their siblings' padding and edges; even spacing between blocks; the main action visible at 390px without scrolling; no awkward wraps; shared empty, loading and error parts; nothing added or removed unless the brief lists it.
- Measure against main what models barely see: line height, radius, control sizes and colours per row, key colours, and a scroll recording of each open menu, where more than 1px of drift is jitter.

## AI tells
- UI: cream with a serif display face and a terracotta accent, italic accent words in headings, numbered 01/02/03 labels, small uppercase mono labels everywhere, pills and the same radius and shadow on every box, purple-blue gradients and glass, emoji as icons, stat tiles that aren't the point, a small heading above the real one.
- Copy: "not just X, but Y", lists of three by habit, trailing "-ing" clauses, seamless/elevate/vibrant/effortless/unlock/robust, "serves as" for "is", em dashes and colon reveals, cheering empty states.
- A project's own look is the spec; matching it is not a tell.

## Mobile ladder
- Before each review: `--all-widths`, with and without `--reduce`; emulation fakes size and touch only.
- Speed: Lighthouse mobile at 6x CPU on the home page and one signed-in screen, before and after.
- End of the pass: the real phone for keyboard, collapsing browser bars, Back on every overlay, scroll feel and a trace.
- After release: real-visitor web vitals before and after.

## Traps
- Full-page shots in Chrome drop touch emulation; `ui-check` shoots touch widths from a second Chrome launched with coarse-pointer blink settings.
- A page load can rotate the refresh token, so sign-ins shared between runs log each other out.
- Chrome refuses full-range VP9 clips; `make.mjs` re-encodes them to TV range.
- On Windows, stopping a background task leaves its node children running.
- A bundler may refuse a worktree's linked node_modules (Turbopack does); install for real there, and unlink links before deleting a worktree.
- Each dev server grows to about 3 GB and a typecheck takes about 2.6 GB: run only as many as free memory allows, and queue typechecks.
- A sleeping or locked laptop kills every process; set sleep to never for an unattended run.
- A dev server can serve stale CSS after many edits: check a computed style before trusting a shot.
- Exit keyframes need fill-mode forwards, or a closing popup flashes back before it unmounts.
- Android pans the page under the keyboard unless the viewport meta sets `interactive-widget=resizes-content`; headless runs can't press Back.
- Artifact limits: 255 files per publish and about 511 per version, so the tracker uses one picture per screen.
- Base UI focus guards raise axe `aria-hidden-focus`; treat it as a known false positive.
- Mail designs are judged as Gmail shows them: no web fonts, images blocked, and the Gmail app's dark mode leaves a mail's colours alone, so forced-dark browser shots show problems readers don't have.

## Evidence
- Judges pass their own model family's work too often ([Pombal et al. 2026](https://arxiv.org/abs/2604.06996)); a second reviewer from another model finds more than a second pass by the same one ([2610.01471](https://arxiv.org/abs/2610.01471)).
- Designers agree on the better screen only 62% of the time, and a personal sample predicts a person better ([DesignPref](https://arxiv.org/html/2511.20513v1)): hence a taste file.
- Naive self-refinement levels off, then degrades ([RubSE](https://arxiv.org/abs/2608.24138)).
- Compliance falls as instructions pile up ([IFScale](https://arxiv.org/abs/2507.11538)): keep rule and taste files short and move checkable rules into scripts.
