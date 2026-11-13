// Usage: node record.mjs <set> [moment-prefix...] [--config ui-pass.config.mjs] [--moments ui-pass.moments.mjs]
//        [--dir <shots>] [--widths 390,1440] [--data] [--skip-done] [--list]
// Two sets line up to a video frame only when their moments replay the same steps with the same fixed waits.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HEIGHT, TOUCH_ARGS } from "../viewports.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const load = async (path) => (await import(pathToFileURL(resolve(path)).href)).default;
const configFile = resolve(flag("config", "ui-pass.config.mjs"));
const config = await load(configFile);
const MOMENTS = await load(flag("moments", "ui-pass.moments.mjs"));
// The skill ships no node_modules: Playwright resolves from the config's folder upwards.
const { chromium } = createRequire(configFile)("playwright");

const valued = new Set(["--config", "--moments", "--dir", "--widths"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const [set, ...prefixes] = positional;
const withData = args.includes("--data");
const widthsWanted = flag("widths", "390,1440").split(",").map(Number);
// One folder per run, so runs at once keep their own raw videos and frames.
const SCRATCH = join(process.env.MOTION_SCRATCH ?? join(tmpdir(), "ui-pass-motion"), `${set}-${process.pid}`);

const picked = MOMENTS.filter((m) => prefixes.length === 0 || prefixes.some((p) => m.id.startsWith(p)));
if (args.includes("--list")) {
  for (const m of MOMENTS) console.log(`${m.id.padEnd(30)} ${m.widths.join(",").padEnd(9)} ${m.data ? "DATA" : "free"}  ${m.account ?? "-"}  ${m.route}`);
  process.exit(0);
}
if (!set) throw new Error("Usage: record.mjs <set> [moment-prefix...] [--data] [--widths 390,1440]");
const out = resolve(flag("dir", config.shots), set);
mkdirSync(out, { recursive: true });
mkdirSync(SCRATCH, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = {
  390: { viewport: { width: 390, height: HEIGHT[390] }, isMobile: true, hasTouch: true },
  1440: { viewport: { width: 1440, height: HEIGHT[1440] } },
};
const STILL_SCALE = { 390: 2, 1440: 1 };
const STRIP = { 390: { frame: 195, cols: 10 }, 1440: { frame: 360, cols: 8 } };

async function newContext(browser, width, m, { video, reduce }) {
  const size = SIZES[width];
  const ctx = await browser.newContext({
    ...size,
    deviceScaleFactor: video ? 1 : STILL_SCALE[width],
    reducedMotion: reduce ? "reduce" : "no-preference",
    permissions: ["clipboard-read", "clipboard-write"],
    ...(video ? { recordVideo: { dir: join(SCRATCH, "raw"), size: size.viewport } } : {}),
  });
  await config.prepare?.(ctx, m);
  return ctx;
}

const FLASH_ON = () => {
  const d = document.createElement("div");
  d.id = "__flash";
  d.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#ff00ff";
  document.body.append(d);
};
const FLASH_OFF = () => document.getElementById("__flash")?.remove();

/** Runs one moment at one width. "video" keeps a video; "reduced" ends with a reduced-motion still. */
async function take(browser, m, width, mode) {
  const reduce = mode === "reduced";
  const ctx = await newContext(browser, width, m, { video: mode === "video", reduce });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (c) => c.type() === "error" && !/ERR_FAILED/.test(c.text()) && problems.push(`console: ${c.text().slice(0, 200)}`));
  const touch = width === 390;
  const h = {
    width,
    touch,
    base: config.base,
    wait,
    press: (locator) => (touch ? locator.tap() : locator.click()),
    async start() {
      await page.evaluate(FLASH_ON);
      await wait(400);
      await page.evaluate(FLASH_OFF);
    },
  };
  let video;
  try {
    video = page.video();
    if (m.account) await config.signIn(page, m.account);
    await m.run(page, h);
    await wait(300);
    if (mode === "reduced") {
      const cdp = await ctx.newCDPSession(page);
      // No clip: a clip is in document coordinates, so a scrolled page would shoot its top. This is the viewport.
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(out, `${m.id}@${width}.reduced.png`), Buffer.from(data, "base64"));
    }
  } finally {
    await ctx.close();
  }
  return { video, problems };
}

/** Finds the end of the magenta flash in the raw video: the first non-magenta frame after the last magenta one. */
function flashEnd(raw) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", raw, "-vf", "fps=25,scale=2:2:flags=area,format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const frames = buf.length / 12;
  let last = -1;
  for (let i = 0; i < frames; i++) {
    const r = buf[i * 12], g = buf[i * 12 + 1], b = buf[i * 12 + 2];
    if (r > 150 && g < 100 && b > 150) last = i;
    else if (last >= 0 && i > last + 3) break;
  }
  return last < 0 ? null : (last + 1) / 25;
}

function encode(raw, cut, dest) {
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", cut.toFixed(2), "-i", raw,
    "-vf", "scale=in_range=tv:out_range=tv,format=yuv420p",
    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "24", "-row-mt", "1", "-deadline", "good", "-cpu-used", "3",
    "-color_range", "tv", "-an", dest,
  ]);
}

function strip(video, width, dest) {
  const dir = join(SCRATCH, "frames");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { frame, cols } = STRIP[width];
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=10,scale=${frame}:-1`, join(dir, "f%03d.png")]);
  const files = readdirSync(dir).sort();
  const args = ["montage"];
  files.forEach((f, i) => args.push("-label", `${i * 100} ms`, join(dir, f)));
  args.push("-tile", `${cols}x`, "-geometry", `${frame}x+3+3`, "-pointsize", "14", "-background", "#222", "-fill", "white", dest);
  execFileSync("magick", args);
  rmSync(dir, { recursive: true, force: true });
  return files.length;
}

const reportFile = join(out, "report.json");
const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")) : [];
const skipDone = args.includes("--skip-done");
const done = (m, width) => skipDone && report.some((r) => r.ok && r.id === m.id && r.width === width);
const ran = [];
// Touch widths get a browser whose pointer is coarse, since a context's touch emulation alone keeps a fine pointer.
const launch = (width) => chromium.launch({ channel: "chrome", args: width === 390 ? TOUCH_ARGS : [] });
// A hung take (it happened once with no error) must not stall the set.
const within = (promise, ms) => {
  let timer;
  const hung = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`take hung for ${ms / 1000} s`)), ms)));
  return Promise.race([promise, hung]).finally(() => clearTimeout(timer));
};
for (const width of widthsWanted) {
  const todo = picked.filter((m) => m.widths.includes(width) && (withData || !m.data) && !done(m, width));
  if (!todo.length) continue;
  let browser = await launch(width);
  try {
    for (const m of todo) {
      const row = { id: m.id, width, data: !!m.data };
      console.log(`${m.id}@${width}`);
      try {
        rmSync(join(SCRATCH, "raw"), { recursive: true, force: true });
        const t0 = Date.now();
        const { video, problems } = await within(take(browser, m, width, "video"), 150_000);
        const raw = join(SCRATCH, `raw-${m.id}-${width}.webm`);
        await video.saveAs(raw);
        const cut = flashEnd(raw);
        if (cut === null) {
          copyFileSync(raw, join(out, `${m.id}@${width}.noflash.webm`));
          throw new Error("no flash found in the video");
        }
        const dest = join(out, `${m.id}@${width}.webm`);
        encode(raw, cut, dest);
        row.frames = strip(dest, width, join(out, `${m.id}@${width}.strip.png`));
        rmSync(raw, { force: true });
        row.takeMs = Date.now() - t0;
        row.problems = problems;
        const still = await within(take(browser, m, width, "reduced"), 150_000);
        row.problems.push(...still.problems.map((p) => `reduced ${p}`));
        row.ok = true;
      } catch (e) {
        row.ok = false;
        row.error = String(e.message ?? e).split("\n")[0];
        console.log("  FAILED", row.error);
        process.exitCode = 1;
        if (/hung/.test(row.error)) {
          await browser.close().catch(() => {});
          browser = await launch(width);
        }
      }
      ran.push(row);
      const at = report.findIndex((r) => r.id === m.id && r.width === width);
      if (at === -1) report.push(row);
      else report[at] = row;
      writeFileSync(reportFile, JSON.stringify(report, null, 2));
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
rmSync(SCRATCH, { recursive: true, force: true });
console.log(ran.map((r) => `${r.ok ? "ok  " : "FAIL"} ${r.id}@${r.width}${r.ok ? ` ${r.frames} frames` : ` ${r.error}`}`).join("\n"));
