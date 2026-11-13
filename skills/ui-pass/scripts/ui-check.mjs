// Screenshots and UI gates for every screen in the project's screen list. Run from the project root with Node.
// Usage: node ui-check.mjs [id-prefix...] [--config ui-pass.config.mjs] [--out after] [--widths 390,1440] [--all-widths]
//        [--reduce] [--scale 2] [--base <url>] [--no-shots] [--env <name>] [--resume] [--exact] [--keep-png]
// --base changes where shots load, not where config.signIn goes.
// Screen fields: id, route, account, widths (both|phone-only|laptop-only), viewport {width,height} (replaces widths),
// steps (body of async (page, width) => ...), motion, viewportOnly, permissions, env (runs only with --env), skip,
// mutates (runs after the rest); config.prepare sees the whole screen, so projects can add their own fields.
// Gates: page overflow, targets under 24px (44px on touch widths warns), inputs under 16px on touch widths,
// axe serious/critical, console errors. Report: <shots>/<out>/report.json; shots: <id>@<width>.webp.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);
const valued = new Set(["--out", "--widths", "--scale", "--base", "--env", "--config"]);
const prefixes = args.filter((arg, i) => !arg.startsWith("--") && !valued.has(args[i - 1]));

const configFile = resolve(flag("config", "ui-pass.config.mjs"));
const { default: config } = await import(pathToFileURL(configFile).href);
// The skill ships no node_modules: Playwright and axe resolve from the config's folder upwards.
const require = createRequire(configFile);
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;

const base = flag("base", config.base);
const out = resolve(config.shots, flag("out", "after"));
const widths = has("all-widths") ? [360, 390, 768, 1440] : flag("widths", "390,1440").split(",").map(Number);
const scale = Number(flag("scale", "1"));
const shots = !has("no-shots");
const HEIGHT = { 360: 740, 390: 844, 768: 1024, 1440: 900 };

const env = flag("env", undefined);
const screens = JSON.parse(readFileSync(resolve(config.screens), "utf8"))
  .filter((s) => !s.skip && s.env === env && (prefixes.length === 0 || prefixes.some((p) => (has("exact") ? s.id === p : s.id.startsWith(p)))))
  .sort((a, b) => Number(Boolean(a.mutates)) - Number(Boolean(b.mutates)));
mkdirSync(out, { recursive: true });
// One run per set: stopping a background task on Windows leaves its Node child running.
const lock = join(out, ".lock");
if (existsSync(lock)) {
  const pid = Number(readFileSync(lock, "utf8"));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  if (alive) throw new Error(`Another ui-check (pid ${pid}) is writing ${out}; stop it first.`);
}
writeFileSync(lock, String(process.pid));
process.on("exit", () => rmSync(lock, { force: true }));
// Its own sign-ins: each page load can replace the refresh token, so sign-ins shared with another process break.
const authDir = resolve(config.shots, `.auth-${flag("out", "after")}`);
mkdirSync(authDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
// Full-page shots drop a context's touch emulation, so touch widths get a browser whose pointer is coarse for good.
let touchBrowser;
const browserFor = async (touch) =>
  touch
    ? (touchBrowser ??= await chromium.launch({
        channel: "chrome",
        args: ["--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"],
      }))
    : browser;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** A saved sign-in per account, renewed every 30 minutes: an older one can load with stale roles. */
async function authState(account) {
  const file = join(authDir, `${account}.json`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 30 * 60_000) return file;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await config.signIn(page, account);
  await context.storageState({ path: file });
  await context.close();
  return file;
}

/** Scrolls the whole page once so scroll-triggered reveals settle, then returns to the top. */
async function settle(page, motion) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  if (motion) {
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
      window.scrollTo(0, 0);
    });
  }
  await page.waitForTimeout(motion ? 1500 : 500);
}

/** Layout gates measured in the page. */
function measure(touch) {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const name = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}"`;
  const scrollsX = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
    }
    return false;
  };
  const overflow = [];
  if (document.documentElement.scrollWidth > vw + 1) {
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (visible(el) && r.right > vw + 1 && !scrollsX(el)) overflow.push(`${name(el)} right=${Math.round(r.right)}`);
      if (overflow.length >= 10) break;
    }
  }
  const small = [];
  const nearTouch = [];
  // Visually hidden native inputs (1px, behind a styled control) are not targets.
  const targets = [
    ...document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=tab], [role=checkbox], [role=radio], [role=switch]",
    ),
  ].filter((el) => visible(el) && el.getBoundingClientRect().width > 2);
  const rects = targets.map((el) => el.getBoundingClientRect());
  for (const [i, el] of targets.entries()) {
    // Inline text links are exempt from target size.
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
    const r = rects[i];
    // A control can widen its tap area with an absolutely placed ::after; count it.
    const after = getComputedStyle(el, "::after");
    const grow = (side) => (after.position === "absolute" ? Math.max(0, -parseFloat(after[side]) || 0) : 0);
    const w = r.width + grow("left") + grow("right");
    const h = r.height + grow("top") + grow("bottom");
    if (Math.min(w, h) < 24) {
      // WCAG 2.5.8 spacing exception: a 24px circle on its centre touches no other target.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const crowded = rects.some((o, j) => {
        if (j === i) return false;
        const dx = Math.max(o.left - cx, 0, cx - o.right);
        const dy = Math.max(o.top - cy, 0, cy - o.bottom);
        return Math.hypot(dx, dy) < 12;
      });
      if (crowded) small.push(`${name(el)} ${Math.round(w)}x${Math.round(h)}`);
    } else if (touch && h < 44) nearTouch.push(`${name(el)} ${Math.round(w)}x${Math.round(h)}`);
  }
  const tinyInputs = touch
    ? [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")]
        .filter((el) => visible(el) && el.getBoundingClientRect().width > 2 && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${name(el)} ${getComputedStyle(el).fontSize}`)
    : [];
  return { pageOverflow: document.documentElement.scrollWidth - vw, overflow, small, nearTouch, tinyInputs };
}

// The report is saved after every shot, so a killed run loses nothing; --resume skips shots already taken.
const reportFile = join(out, "report.json");
const earlier = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")) : [];
const done = new Set(has("resume") ? earlier.filter((r) => !r.failed).map((r) => `${r.id}@${r.width}`) : []);
const report = [];
const save = () => {
  const fresh = new Set(report.map((r) => `${r.id}@${r.width}`));
  writeFileSync(reportFile, JSON.stringify([...earlier.filter((r) => !fresh.has(`${r.id}@${r.width}`)), ...report], null, 2));
};
for (const screen of screens) {
  const sizes = screen.viewport
    ? [screen.viewport]
    : widths
        .filter((w) => !(screen.widths === "phone-only" && w > 767) && !(screen.widths === "laptop-only" && w < 1024))
        .map((w) => ({ width: w, height: HEIGHT[w] ?? 900 }));
  for (const size of sizes) {
    const { width } = size;
    const touch = width < 1024 || size.height < 520;
    const tag = screen.viewport ? `${width}x${size.height}` : `${width}`;
    if (done.has(`${screen.id}@${tag}`)) continue;
    const entry = { id: screen.id, width: tag, errors: [] };
    const context = await (await browserFor(touch)).newContext({
      viewport: size,
      permissions: screen.permissions,
      deviceScaleFactor: scale,
      isMobile: touch,
      hasTouch: touch,
      reducedMotion: has("reduce") ? "reduce" : "no-preference",
      storageState: screen.account ? await authState(screen.account) : undefined,
    });
    await config.prepare?.(context, screen);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("console", (m) => m.type() === "error" && entry.errors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => entry.errors.push(String(e).slice(0, 200)));
    // A shot that hangs (a page script, axe, a never-ending scroll) is cut off and recorded as failed.
    let watchdog;
    const hung = new Promise((_, reject) => {
      watchdog = setTimeout(() => reject(new Error("shot took over 2 minutes")), 120_000);
    });
    try {
      await Promise.race([hung, shoot()]);
    } catch (error) {
      entry.failed = String(error).split("\n")[0].slice(0, 300);
      await page.screenshot({ path: join(out, `${screen.id}@${tag}.fail.png`), timeout: 10_000 }).catch(() => undefined);
    }
    clearTimeout(watchdog);
    async function shoot() {
      await page.goto(`${base}${screen.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settle(page, screen.motion);
      if (screen.account && config.signedIn && !(await config.signedIn(page, screen.account))) {
        throw new Error("loaded signed out");
      }
      // Hidden tab panels can stay mounted, so a label can match a hidden field too; steps only see visible elements.
      const visiblePage = new Proxy(page, {
        get(target, prop) {
          const value = target[prop];
          if (typeof value !== "function") return value;
          if (String(prop).startsWith("getBy")) return (...a) => value.apply(target, a).filter({ visible: true });
          return value.bind(target);
        },
      });
      if (screen.steps) await new AsyncFunction("page", "width", screen.steps)(visiblePage, width);
      await page.waitForTimeout(400);
      Object.assign(entry, await page.evaluate(measure, touch));
      const axe = await new AxeBuilder({ page }).exclude("iframe").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      entry.axe = axe.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`);
      if (shots) {
        const png = join(out, `${screen.id}@${tag}.png`);
        await page.screenshot({ path: png, fullPage: !screen.viewportOnly, animations: "allow" });
        // WebP stops at 16383px a side; very long pages are scaled to fit.
        execFileSync("magick", [png, "-resize", "16000x16000>", "-quality", "72", png.replace(/\.png$/, ".webp")], {
          timeout: 60_000,
        });
        if (!has("keep-png")) rmSync(png);
      }
    }
    entry.pass =
      !entry.failed && entry.pageOverflow <= 0 && entry.small?.length === 0 && entry.tinyInputs?.length === 0 && entry.axe?.length === 0;
    report.push(entry);
    save();
    console.log(`${entry.pass ? "PASS" : "FAIL"} ${screen.id}@${tag}${entry.failed ? ` ${entry.failed}` : ""}`);
    // Keep the refreshed sign-in for the next page of this account; a shot that signed out or loaded signed out
    // drops it, so the next page signs in afresh.
    if (screen.account) {
      const saved = join(authDir, `${screen.account}.json`);
      if (entry.failed || screen.steps?.includes("Sign out")) rmSync(saved, { force: true });
      else await context.storageState({ path: saved });
    }
    await Promise.race([context.close(), new Promise((r) => setTimeout(r, 15_000))]);
  }
}
await browser.close();
await touchBrowser?.close();
save();
const failed = report.filter((r) => !r.pass).length;
console.log(`${report.length - failed}/${report.length} passed. Report: ${reportFile}`);
process.exitCode = failed ? 1 : 0;
