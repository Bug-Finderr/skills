// Starter for one flow video. Copy next to your outputs, rename, replace the steps. Run with Node, not Bun.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Absolute path of this skill's scripts/vlib.mjs; the skill tells you where it lives.
const VLIB = "<skill-dir>/scripts/vlib.mjs";
const { consoleErrors, finishVideo, launch, plainPage, recordedPage, say } = await import(
  pathToFileURL(VLIB).href
);

const OUT = path.dirname(fileURLToPath(import.meta.url));
const NAME = "flow-name";

const browser = await launch();

// Setup the viewer should not watch (seeding, other accounts) runs on a plain page first.
const setup = await plainPage(browser);
await setup.context().close();

const page = await recordedPage(browser, OUT, NAME);
try {
  // Sign in and open the screen the way the project's seed file or docs say.
  // Clicks and taps mark themselves. For a phone flow pass PHONE to recordedPage and use tap().
  await say(page, "What the viewer is looking at, in plain words.", 3000);
} finally {
  await finishVideo(page, OUT, NAME);
  await browser.close();
  console.log(consoleErrors.length ? consoleErrors.join("\n") : "no console errors");
}
