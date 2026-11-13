// Usage: node judge.mjs <before> <after> [id-prefix...] --out <dir> [--judges muse,codex] [--prompt <file>] [--noise 1500] [--config ui-pass.config.mjs]
// <before> and <after> are two images, or two shot sets under the config's shots folder whose changed viewport pieces are judged.
// Needs magick, curl, OPENROUTER_API_KEY and a signed-in codex CLI; nothing telling which side is new may sit in --out while judges run.
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HEIGHT } from "../viewports.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const [before, after, ...prefixes] = args.filter((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
const judges = flag("judges", "muse").split(",");
const prompt = readFileSync(flag("prompt", new URL("prompt.txt", import.meta.url)), "utf8");
const NOISE = Number(flag("noise", 1500)); // changed pixels a piece may differ by from animation alone

const out = resolve(flag("out"));
if (existsSync(out)) throw new Error(`${out} exists; pass a new --out`);
mkdirSync(join(out, "tiles"), { recursive: true });

const magick = (argv) => execFileSync("magick", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const size = (file) => magick(["identify", "-format", "%w %h", file]).trim().split(" ").map(Number);
const difference = (a, b) => {
  try {
    magick(["compare", "-metric", "AE", "-fuzz", "6%", a, b, "null:"]);
    return 0;
  } catch (failure) {
    return Number.parseFloat(String(failure.stderr)) || Number.POSITIVE_INFINITY;
  }
};

let pairs;
let still;
if (/\.(png|jpe?g|webp)$/i.test(before)) {
  pairs = [{ id: basename(after, extname(after)), base: resolve(before), new: resolve(after) }];
  still = pairs[0];
} else {
  const configFile = resolve(flag("config", "ui-pass.config.mjs"));
  const { default: config } = await import(pathToFileURL(configFile).href);
  const [a, b] = [before, after].map((set) => resolve(config.shots, set));
  const names = readdirSync(a).filter(
    (n) => n.endsWith(".webp") && existsSync(join(b, n)) && (prefixes.length === 0 || prefixes.some((p) => n.startsWith(p))),
  );
  const tiles = [];
  for (const name of names) {
    const [, w, h] = name.match(/@(\d+)(?:x(\d+))?\.webp$/);
    const [wa, ha] = size(join(a, name));
    const [, hb] = size(join(b, name));
    const th = Math.round(((Number(h) || HEIGHT[w]) ?? 900) * (wa / w));
    const kind = w < 768 ? "p" : "l";
    for (let i = 0; i < Math.ceil(Math.max(ha, hb) / th); i++) {
      const id = `${name.replace(".webp", "")}-${kind}${i}`;
      const ta = join(out, "tiles", `${id}-base.png`);
      const tb = join(out, "tiles", `${id}-new.png`);
      for (const [src, dst] of [[join(a, name), ta], [join(b, name), tb]]) {
        magick([src, "-crop", `${wa}x${th}+0+${i * th}`, "+repage", "-background", "#ffffff", "-extent", `${wa}x${th}`, dst]);
      }
      const view = kind === "p" ? `phone, ${w}px wide` : `${w}px wide`;
      tiles.push({ id, kind, view, tile: i, diff: difference(ta, tb), base: ta, new: tb });
    }
  }
  const changed = tiles.filter((t) => t.diff > NOISE).sort((x, y) => y.diff - x.diff);
  pairs = [...changed.filter((t) => t.kind === "p").slice(0, 6), ...changed.filter((t) => t.kind === "l").slice(0, 4)];
  still = tiles.find((t) => t.diff === 0 && t.tile === 0) ?? tiles[0];
  const dropped = changed.filter((t) => !pairs.includes(t)).map((t) => t.id);
  writeFileSync(join(out, "tiles.json"), JSON.stringify({ noise: NOISE, changed: changed.map(({ id, diff }) => ({ id, diff })), dropped }, null, 1));
  console.log(`${pairs.length} pairs + control from ${changed.length} changed of ${tiles.length} pieces; ${dropped.length} changed pieces not judged`);
  if (!pairs.length) process.exit(0);
}

// The control goes between two judged pairs at random; with only one judged pair it comes last.
const rows = pairs.map((t) => ({ t, control: false }));
rows.splice(1 + Math.floor(Math.random() * (rows.length - 1)), 0, { t: still, control: true });
const key = {};
const sets = {};
for (const set of ["o1", "o2"]) {
  mkdirSync(join(out, set));
  sets[set] = rows.flatMap(({ t, control }, n) => {
    const pair = String(n + 1).padStart(2, "0");
    const newIsX = (n % 2 === 0) === (set === "o1");
    const [x, y] = control ? [t.base, t.base] : newIsX ? [t.new, t.base] : [t.base, t.new];
    // The control may reuse a judged piece, so it gets its own name or the two pairs' votes would merge.
    key[`${set}:${pair}`] = { tile: control ? `control ${t.id}` : t.id, control, X: control ? "base" : newIsX ? "new" : "base", Y: control ? "base" : newIsX ? "base" : "new" };
    return [["X", x], ["Y", y]].map(([side, src]) => {
      const file = join(out, set, `pair${pair}-${side}.jpg`);
      const fit = t.kind ? ["-resize", t.kind === "p" ? "780x1688>" : "1440x900>"] : [];
      magick([src, ...fit, "-quality", "88", file]);
      return { label: `Pair ${pair}, version ${side}${t.view ? ` (${t.view})` : ""}`, file };
    });
  });
}
// Piece names say which side is new, so they go before any judge can look in --out.
rmSync(join(out, "tiles"), { recursive: true });

const run = (cmd, argv, stdio = "ignore") =>
  new Promise((done, fail) => spawn(cmd, argv, { stdio }).on("error", fail).on("close", done));

// Muse Wonder at xhigh through OpenRouter. curl, not fetch: Node's fetch gives up on headers after five minutes.
async function muse(files, answer) {
  const payload = `${answer}.payload.json`;
  const images = files.flatMap(({ label, file }) => [
    { type: "text", text: `${label}:` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${readFileSync(file).toString("base64")}` } },
  ]);
  const body = { model: "meta/muse-wonder", reasoning: { effort: "xhigh" }, max_tokens: 16000, messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }] };
  writeFileSync(payload, JSON.stringify(body));
  const raw = openSync(`${answer}.json`, "w");
  await run("curl", ["-s", "--max-time", "900", "https://openrouter.ai/api/v1/chat/completions", "-H", `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`,
    "-H", "Content-Type: application/json", "--data-binary", `@${payload}`], ["ignore", raw, "ignore"]);
  closeSync(raw);
  const response = JSON.parse(readFileSync(`${answer}.json`, "utf8") || "{}");
  return { text: response.choices?.[0]?.message?.content ?? JSON.stringify(response.error ?? response), cost: response.usage?.cost ?? 0 };
}

// gpt-6.1-sol through codex: stdin must be closed or codex waits on it, the prompt goes before -i (which takes several
// values), -o is written only when the run ends, and an empty folder outside any repo keeps project files and skills out.
async function codex(files, answer) {
  const blank = mkdtempSync(join(tmpdir(), "judge-"));
  const log = openSync(`${answer}.err`, "w");
  const listed = `${prompt}\nThe attached images, in order: ${files.map((f) => f.label).join("; ")}.`;
  await run("codex", ["exec", "--skip-git-repo-check", "-C", blank, "-s", "read-only", "-m", "gpt-6.1-sol", "-c", "model_reasoning_effort=high",
    "-o", answer, listed, ...files.flatMap((f) => ["-i", f.file])], ["ignore", log, log]);
  closeSync(log);
  rmSync(blank, { recursive: true });
  const tokens = readFileSync(`${answer}.err`, "utf8").match(/tokens used\s+([\d,]+)/)?.[1].replaceAll(",", "");
  return { text: existsSync(answer) ? readFileSync(answer, "utf8") : "", tokens: Number(tokens ?? 0) };
}

// One request per judge and order: failures are rare, so a failed run is rerun with a new --out.
const ask = { muse, codex };
const spent = Object.fromEntries(judges.map((j) => [j, { cost: 0, tokens: 0 }]));
await Promise.all(
  judges.flatMap((judge) =>
    ["o1", "o2"].map(async (set) => {
      const answer = join(out, `${judge}-${set}.md`);
      const { text, cost = 0, tokens = 0 } = await ask[judge](sets[set], answer);
      writeFileSync(answer, text);
      spent[judge].cost += cost;
      spent[judge].tokens += tokens;
    }),
  ),
);
writeFileSync(join(out, "key.json"), JSON.stringify(key, null, 1));

const block = (file) => {
  const match = [...readFileSync(file, "utf8").matchAll(/```json\s*([\s\S]*?)```/g)].at(-1);
  if (!match) throw new Error(`no JSON block in ${file}`);
  return JSON.parse(match[1]);
};

// A pair counts for a version only when the judge picked it in both orders; the control must be called same at least once.
const result = { judges: {}, pairs: {}, control: {}, missing: [], problems: [], fixes: [], spent };
for (const judge of judges) {
  const answers = {};
  for (const set of ["o1", "o2"]) {
    const answer = block(join(out, `${judge}-${set}.md`));
    for (const p of answer.pairs ?? []) {
      const at = `${set}:${String(p.pair).replace(/\D/g, "").padStart(2, "0")}`;
      const side = String(p.better).trim().toUpperCase();
      if (key[at] && ["X", "Y", "SAME"].includes(side)) (answers[at] ??= []).push({ set, side, problems: p.problems });
    }
    for (const fix of answer.top_fixes ?? []) result.fixes.push(`${judge} ${set}: ${fix}`);
  }
  const picks = {};
  for (const [at, k] of Object.entries(key)) {
    // Only one valid answer per pair and order counts, or a judge could pass by skipping the pairs it would lose.
    if (answers[at]?.length !== 1) {
      result.missing.push(`${judge} ${at} ${k.tile}`);
      continue;
    }
    const [{ set, side, problems }] = answers[at];
    const version = side === "SAME" ? "same" : k[side];
    (picks[k.tile] ??= { control: k.control, votes: [] }).votes.push(version);
    for (const problem of problems ?? []) result.problems.push(`${judge} ${set} ${k.tile} (better: ${version}): ${problem}`);
  }
  const tally = { new: 0, base: 0, split: 0, control_ok: false };
  for (const [tile, { control, votes }] of Object.entries(picks)) {
    const both = votes.length === 2 && votes[0] === votes[1] && votes[0] !== "same" ? votes[0] : "split";
    if (control) {
      // Both sides are the same image, so a judge that never calls it "same" is guessing.
      tally.control_ok = votes.includes("same");
      result.control[judge] = { tile, votes };
      continue;
    }
    tally[both === "split" ? "split" : both] += 1;
    (result.pairs[tile] ??= {})[judge] = { verdict: both, votes };
  }
  result.judges[judge] = tally;
}
const all = Object.values(result.judges);
result.lost = Object.entries(result.pairs).filter(([, v]) => judges.every((j) => v[j]?.verdict === "base")).map(([t]) => t);
result.accepted = all.length > 0 && all.every((t) => t.control_ok && t.new > t.base) && result.lost.length === 0 && result.missing.length === 0;
writeFileSync(join(out, "verdict.json"), JSON.stringify(result, null, 1));

for (const [tile, by] of Object.entries(result.pairs)) {
  console.log(`${tile}: ${judges.map((j) => `${j} ${by[j]?.verdict ?? "missing"} (${by[j]?.votes.join("/") ?? "-"})`).join(", ")}`);
}
for (const judge of judges) {
  const { new: wins, base, split, control_ok } = result.judges[judge];
  const calls = result.control[judge]?.votes.map((v) => (v === "same" ? "same" : "side")).join("/") ?? "missing";
  const paid = judge === "muse" ? `$${spent[judge].cost.toFixed(4)}` : `${spent[judge].tokens} tokens`;
  console.log(`${judge}: ${wins} new, ${base} base, ${split} split; control ${control_ok ? "held" : "FAILED"} (${calls}); ${paid}`);
}
if (result.missing.length) console.log(`no single valid answer: ${result.missing.join("; ")}`);
console.log(`accepted: ${result.accepted ? "yes" : "no"}; answers and problems in ${out}`);
