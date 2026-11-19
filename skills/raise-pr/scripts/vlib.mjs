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
// Phone pages get touch input: drive them with locator.tap(), not click().
export const PHONE = { width: 390, height: 844 };
const isPhone = (viewport) => viewport.width < 768;
const device = (viewport) => ({ viewport, hasTouch: isPhone(viewport), isMobile: isPhone(viewport) });

// Tap marks look like a phone's own "show taps" dot, grey with a white edge, so no one reads them as app UI.
const dot = (size) =>
  `width:${size}px;height:${size}px;border-radius:50%;border:2px solid rgba(255,255,255,.9);` +
  "box-shadow:0 0 0 1px rgba(60,60,60,.5);background:rgba(60,60,60,.45);box-sizing:border-box";

// Captions from say() explain the steps, so Playwright's own action titles stay hidden.
const showActions = (touch) => ({
  duration: 800,
  cursor: touch ? "none" : "pointer",
  style: { point: dot(touch ? 40 : 28), title: "display:none" },
});

// Playwright shows the dot before each action; this ripples out from the spot when the press lands.
// Runs inside the page, so it gets the dot's style as an argument.
function ripple(look) {
  addEventListener(
    "pointerdown",
    (e) => {
      // A popover sits in the top layer, so the ripple also shows above an open <dialog>.
      const el = Object.assign(document.createElement("div"), { popover: "manual" });
      el.style.cssText =
        `position:fixed;inset:auto;margin:0;padding:0;overflow:visible;left:${e.clientX - 30}px;top:${e.clientY - 30}px;` +
        `${look};pointer-events:none`;
      document.documentElement.append(el);
      el.showPopover();
      const grow = el.animate(
        { transform: ["scale(.3)", "scale(1.4)"], opacity: [1, 0] },
        { duration: 600, easing: "ease-out" },
      );
      grow.onfinish = grow.oncancel = () => el.remove();
    },
    true,
  );
}

export const consoleErrors = [];

export function launch() {
  return chromium.launch({ channel: "chrome" });
}

/** A page whose context records a video into `<outDir>/<name>/` until `finishVideo`. */
export async function recordedPage(browser, outDir, name, viewport = DESKTOP) {
  const dir = path.join(outDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    ...device(viewport),
    recordVideo: { dir, size: viewport, showActions: showActions(isPhone(viewport)) },
  });
  await context.addInitScript(ripple, dot(60));
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => consoleErrors.push(`[${name}] ${String(e).slice(0, 300)}`));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`[${name}] ${m.text().slice(0, 300)}`));
  return page;
}

/** A page without video, for setup and cleanup steps that should not be in the recording. */
export async function plainPage(browser, viewport = DESKTOP) {
  const page = await (await browser.newContext(device(viewport))).newPage();
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

/** Puts the video's tap dot where a still's tap or click lands. Dispose the result to remove it. */
export async function mark(page, locator) {
  const b = await locator.boundingBox();
  const r = isPhone(page.viewportSize()) ? 20 : 14;
  return page.screencast.showOverlay(
    `<div style="position:absolute;left:${b.x + b.width / 2 - r}px;top:${b.y + b.height / 2 - r}px;${dot(2 * r)}"></div>`,
  );
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
