// Before/after picture per screen for the tracker and the user, never critics: before row on top, after row below.
// Usage: node pairs.mjs <beforeSet> <afterSet> [idPrefix...] [--config ui-pass.config.mjs]
//        -> <shots>/<$PAIRS or pairs>/<id>.webp, ids on stdout
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const at = args.indexOf("--config");
const configFile = resolve(at === -1 ? "ui-pass.config.mjs" : args[at + 1]);
const { default: config } = await import(pathToFileURL(configFile).href);
const [beforeSet, afterSet, ...prefixes] = args.filter((arg, i) => arg !== "--config" && args[i - 1] !== "--config");
const shots = resolve(config.shots);
const report = (set) => JSON.parse(readFileSync(join(shots, set, "report.json"), "utf8"));
const ok = (set) => new Set(report(set).filter((r) => !r.failed).map((r) => r.id));
const before = ok(beforeSet);
const after = ok(afterSet);
const ids = [...after].filter((id) => before.has(id) && (prefixes.length === 0 || prefixes.some((p) => id.startsWith(p))));
const width = (name) => parseInt(name.split("@")[1]);
const row = (set, id) => {
  const dir = join(shots, set);
  const args = [];
  for (const n of readdirSync(dir).filter((n) => n.startsWith(`${id}@`) && n.endsWith(".webp")).sort((a, b) => width(a) - width(b))) {
    const w = width(n) > 800 ? 900 : 330;
    args.push("(", join(dir, n), "-resize", `${w}x`, "-crop", `${w}x2400+0+0`, "+repage", "-background", "#888", "-gravity", "east", "-splice", "8x0", ")");
  }
  return ["(", ...args, "-background", "#e6e6e6", "-gravity", "north", "+append", "-background", "#d33", "-splice", "0x12", ")"];
};
const dir = join(shots, process.env.PAIRS ?? "pairs");
mkdirSync(dir, { recursive: true });
for (const id of ids) {
  const target = join(dir, `${id}.webp`);
  if (existsSync(target)) continue;
  execFileSync("magick", [...row(beforeSet, id), ...row(afterSet, id), "-background", "#e6e6e6", "-append", "-quality", "60", target]);
  console.log(id);
}
