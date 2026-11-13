// Stacks each moment's strip from set a over the same strip from set b: one image per moment in <shots>/<a>-vs-<b>/.
// Usage: node compare.mjs [a=before] [b=after] [--config ui-pass.config.mjs] [--dir <shots>]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const valued = new Set(["--config", "--dir"]);
const [a = "before", b = "after"] = args.filter((arg, i) => !arg.startsWith("--") && !valued.has(args[i - 1]));
const dir = resolve(flag("dir") ?? (await import(pathToFileURL(resolve(flag("config", "ui-pass.config.mjs"))).href)).default.shots);
const out = join(dir, `${a}-vs-${b}`);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(join(dir, a)).filter((n) => n.endsWith(".strip.png"))) {
  if (!existsSync(join(dir, b, f))) { console.log("missing in", b, f); continue; }
  const name = f.replace(".strip.png", "");
  execFileSync("magick", [
    "(", join(dir, a, f), "-gravity", "NorthWest", "-fill", "yellow", "-pointsize", "28", "-annotate", "+4+4", `${a}: ${name}`, ")",
    "(", join(dir, b, f), "-gravity", "NorthWest", "-fill", "cyan", "-pointsize", "28", "-annotate", "+4+4", `${b}: ${name}`, ")",
    "-background", "#222", "-append", join(out, `${name}.png`),
  ]);
}
console.log("done", out);
