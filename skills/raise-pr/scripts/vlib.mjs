// Shared helpers for captioned PR flow videos on local dev. Run flow scripts with Node, not Bun.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CACHE = path.join(os.homedir(), ".bun/install/cache");
// Newest cached playwright-core; bun keeps several versions side by side.
const core = fs
  .readdirSync(CACHE)
  .filter((dir) => dir.startsWith("playwright-core@"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .at(-1);
const { chromium } = await import(pathToFileURL(path.join(CACHE, core, "index.mjs")).href);

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const DESKTOP = { width: 1280, height: 800 };

export const consoleErrors = [];

export function launch() {
  return chromium.launch({ channel: "chrome" });
}

/** A page whose context records a video into `<outDir>/<name>/` until `finishVideo`. */
export async function recordedPage(browser, outDir, name, viewport = DESKTOP) {
  const dir = path.join(outDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => consoleErrors.push(`[${name}] ${String(e).slice(0, 300)}`));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`[${name}] ${m.text().slice(0, 300)}`));
  return page;
}

/** A page without video, for setup and cleanup steps that should not be in the recording. */
export async function plainPage(browser, viewport = DESKTOP) {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.setDefaultTimeout(25000);
  return page;
}

/** Shows a caption bar at the bottom of the page so the video explains itself. */
export async function say(page, text, ms = 2200) {
  await page
    .evaluate((t) => {
      let el = document.getElementById("__caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__caption";
        el.style.cssText =
          "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:90%;" +
          "background:rgba(10,10,20,.88);color:#fff;font:600 16px/1.35 system-ui,sans-serif;padding:10px 16px;" +
          "border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:none;text-align:center";
        document.body.appendChild(el);
      }
      el.textContent = t;
    }, text)
    .catch(() => {});
  await page.waitForTimeout(ms);
}

export async function settle(page, extra = 900) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForFunction(() => document.querySelector("main") && !document.querySelector("main [aria-busy=true]"), null, {
      timeout: 20000,
    })
    .catch(() => {});
  await page.waitForTimeout(extra);
}

/** Closes the recording and saves it as `<outDir>/<name>.webm`. */
export async function finishVideo(page, outDir, name) {
  const video = page.video();
  await page.context().close();
  fs.renameSync(await video.path(), path.join(outDir, `${name}.webm`));
  fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
}
