// Blind pairwise judge of a UI change: both orders with neutral X/Y labels plus an identical control pair.
// Usage: node judge.mjs <before> <after> [id-prefix...] --out <dir> [--judges muse,codex] [--prompt <file>] [--noise 1500]
//        [--config ui-pass.config.mjs]
// <before> and <after> are two images, or two shot sets under the config's shots folder (<id>@<width>[x<height>].webp),
// cut into viewport-sized pieces of which only the changed ones are judged. Needs magick, curl and OPENROUTER_API_KEY;
// the codex judge (gpt-6.1-sol) needs a signed-in codex CLI. Writes sets, key, answers and verdict.json to --out.
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const [before, after, ...prefixes] = args.filter((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
const judges = flag("judges", "muse").split(",");
const prompt = readFileSync(flag("prompt", new URL("prompt.txt", import.meta.url)), "utf8");
const NOISE = Number(flag("noise", 1500)); // changed pixels a piece may differ by from animation alone
const HEIGHT = { 360: 740, 390: 844, 768: 1024, 1440: 900 }; // ui-check's viewport heights per width

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
  // At most six phone and four wider pieces, the largest changes first.
  pairs = [...changed.filter((t) => t.kind === "p").slice(0, 6), ...changed.filter((t) => t.kind === "l").slice(0, 4)];
  still = tiles.find((t) => t.diff === 0 && t.tile === 0) ?? tiles[0];
  const dropped = changed.filter((t) => !pairs.includes(t)).map((t) => t.id);
  writeFileSync(join(out, "tiles.json"), JSON.stringify({ noise: NOISE, changed: changed.map(({ id, diff }) => ({ id, diff })), dropped }, null, 1));
  console.log(`${pairs.length} pairs + control from ${changed.length} changed of ${tiles.length} pieces; ${dropped.length} changed pieces not judged`);
  if (!pairs.length) process.exit(0);
}

// Pair numbers are shuffled by a fixed rule so the control is not always last; o2 swaps every pair's sides.
const rows = [...pairs.map((t) => ({ t, control: false })), { t: still, control: true }];
const order = rows.map((_, i) => i).sort((x, y) => ((x * 7 + 3) % rows.length) - ((y * 7 + 3) % rows.length));
const key = {};
const sets = {};
for (const set of ["o1", "o2"]) {
  mkdirSync(join(out, set));
  sets[set] = order.flatMap((ri, n) => {
    const { t, control } = rows[ri];
    const pair = String(n + 1).padStart(2, "0");
    // In o1 odd-numbered pairs show the new version as X; o2 flips every pair.
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
writeFileSync(join(out, "key.json"), JSON.stringify(key, null, 1));

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

// gpt-6.1-sol through codex: stdin must be closed or codex waits on it, the prompt goes before -i (which takes
// several values), and -o is written only when the run ends.
async function codex(files, answer) {
  const log = openSync(`${answer}.err`, "w");
  const listed = `${prompt}\nThe attached images, in order: ${files.map((f) => f.label).join("; ")}.`;
  await run("codex", ["exec", "--skip-git-repo-check", "-C", out, "-m", "gpt-6.1-sol", "-c", "model_reasoning_effort=high", "-o", answer,
    listed, ...files.flatMap((f) => ["-i", f.file])], ["ignore", log, log]);
  closeSync(log);
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

const block = (file) => {
  const match = [...readFileSync(file, "utf8").matchAll(/```json\s*([\s\S]*?)```/g)].at(-1);
  if (!match) throw new Error(`no JSON block in ${file}`);
  return JSON.parse(match[1]);
};

// A pair counts for a version only when the judge picked it in both orders; the control must be called same at least once.
const result = { judges: {}, pairs: {}, control: {}, problems: [], fixes: [], spent };
for (const judge of judges) {
  const picks = {};
  for (const set of ["o1", "o2"]) {
    const answer = block(join(out, `${judge}-${set}.md`));
    for (const p of answer.pairs ?? []) {
      const k = key[`${set}:${String(p.pair).replace(/\D/g, "").padStart(2, "0")}`];
      if (!k) continue;
      const side = String(p.better).trim().toUpperCase();
      const version = side === "X" || side === "Y" ? k[side] : "same";
      (picks[k.tile] ??= { control: k.control, votes: [] }).votes.push(version);
      for (const problem of p.problems ?? []) result.problems.push(`${judge} ${set} ${k.tile} (better: ${version}): ${problem}`);
    }
    for (const fix of answer.top_fixes ?? []) result.fixes.push(`${judge} ${set}: ${fix}`);
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
// Accepted: every judge's control held, every judge saw more new wins than base wins, and no piece lost for all judges.
result.lost = Object.entries(result.pairs).filter(([, v]) => judges.every((j) => v[j]?.verdict === "base")).map(([t]) => t);
result.accepted = all.length > 0 && all.every((t) => t.control_ok && t.new > t.base) && result.lost.length === 0;
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
console.log(`accepted: ${result.accepted ? "yes" : "no"}; answers and problems in ${out}`);
