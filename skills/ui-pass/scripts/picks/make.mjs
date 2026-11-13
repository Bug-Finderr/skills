// Builds a picks page from picks.json: stills to WebP in img/, clips to clips/, then index.html and files.json beside them.
// Usage: node make.mjs <picks.json> [outDir=folder of picks.json]   (needs magick, ffmpeg and ffprobe on PATH)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const [input, outArg] = process.argv.slice(2);
const spec = resolve(input);
const out = resolve(outArg ?? dirname(spec));
const picks = JSON.parse(readFileSync(spec, "utf8"));
const files = {};
const names = new Set();
const made = new Map();

function target(from, dir, ext) {
  let name = from.split(/[\\/]/).slice(-2).join("-").replace(/\.\w+$/, "").replace(/[^a-z0-9@-]+/gi, "-");
  while (names.has(name)) name += "-x";
  names.add(name);
  mkdirSync(join(out, dir), { recursive: true });
  const path = `${dir}/${name}${ext}`;
  files[path] = join(out, path);
  return path;
}

function still(from, phone) {
  const path = target(from, "img", ".webp");
  execFileSync("magick", [from, "-resize", phone ? "600x>" : "1200x>", "-quality", phone ? "78" : "74", files[path]]);
  return path;
}

// Chrome will not play full-range (pc) video, so those clips are re-encoded to tv range.
function clip(from) {
  const range = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_range", "-of", "csv=p=0", from], { encoding: "utf8" }).trim();
  const path = target(from, "clips", range === "pc" ? ".webm" : extname(from));
  if (range !== "pc") copyFileSync(from, files[path]);
  else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", from, "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-color_range", "tv", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-an", files[path]]);
  return path;
}

// A source used twice is published once, since a version holds at most 511 files.
function convert(m) {
  const from = resolve(dirname(spec), m.src);
  const phone = m.phone ?? /phone|390/i.test(`${m.cap} ${m.src}`);
  const video = /\.(webm|mp4)$/i.test(from);
  const key = video ? from : `${from}|${phone}`;
  if (!made.has(key)) made.set(key, video ? clip(from) : still(from, phone));
  return { ...m, src: made.get(key), phone, video };
}

const page = {
  title: picks.title,
  intro: picks.intro,
  questions: (picks.questions ?? []).map((q) => ({
    ...q,
    media: (q.media ?? []).map(convert),
    opts: q.opts.map((o) => ({ ...o, media: (o.media ?? []).map(convert) })),
  })),
  checks: (picks.checks ?? []).map((q) => ({ ...q, lead: (q.lead ?? []).map(convert), pairs: (q.pairs ?? []).map(convert) })),
};

// Publish caps, page included: 255 files and 64 MB per call, 511 files and 256 MB per version; 15 MB per file.
const list = Object.entries(files).map(([path, from]) => ({ path, from, size: statSync(from).size }));
const total = list.reduce((n, f) => n + f.size, 0);
const big = list.find((f) => f.size > 15e6);
if (big || list.length > 510 || total > 256e6) {
  console.error(big ? `${big.path} is over 15 MB: shorten or shrink it.` : `${list.length} files, ${(total / 1e6).toFixed(1)} MB: over one version's cap, so split the page.`);
  process.exit(1);
}
const data = `const PAGE = ${JSON.stringify(page).replace(/</g, "\\u003c")};`;
const html = readFileSync(new URL("page.html", import.meta.url), "utf8")
  .replace("<title></title>", `<title>${page.title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>`)
  .replace("/*DATA*/", () => data);
writeFileSync(join(out, "index.html"), html);
const batches = [{}];
let bytes = 0;
for (const f of list) {
  if (Object.keys(batches.at(-1)).length === 254 || bytes + f.size > 64e6) {
    batches.push({});
    bytes = 0;
  }
  batches.at(-1)[f.path] = f.from;
  bytes += f.size;
}
batches.forEach((b, i) => writeFileSync(join(out, i ? `files-${i + 1}.json` : "files.json"), JSON.stringify(b, null, 1)));
console.log(`${list.length} files, ${(total / 1e6).toFixed(1)} MB in ${batches.length} publish${batches.length > 1 ? "es" : ""}.`);
console.log(`Publish ${join(out, "index.html")} with files.json as its files map${batches.length > 1 ? ", then each files-N.json to the same url" : ""}, and capabilities {db: {}}.`);
