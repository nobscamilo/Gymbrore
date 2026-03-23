import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR = process.env.EXERCISE_VIDEO_SOURCE_DIR || "/Users/juansarmiento/Desktop/CompleteAnatomyVideos/videos/exercises";
const PUBLIC_DIR = process.env.EXERCISE_VIDEO_PUBLIC_DIR || path.resolve(process.cwd(), "public/exercise-videos");
const OUTPUT_FILE = process.env.EXERCISE_VIDEO_INDEX_OUTPUT || path.resolve(process.cwd(), "src/data/exerciseVideoIndex.json");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "without",
  "single",
  "arm",
  "leg",
  "lever",
  "cable",
  "dumbbell",
  "barbell",
  "seated",
  "standing",
  "lying",
  "incline",
  "decline",
  "assisted",
  "reverse",
  "low",
  "high",
  "prone",
  "supine",
  "ball",
  "doorway",
  "stick",
  "wall",
]);

const titleCase = (value) => {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const toNormalized = (value) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildKeywords = (baseName) => {
  const normalized = toNormalized(baseName);
  const tokens = normalized.split(" ").filter(Boolean);
  const coreTokens = tokens.filter((token) => !STOP_WORDS.has(token));

  const keywords = new Set();
  keywords.add(normalized);

  if (coreTokens.length > 0) {
    keywords.add(coreTokens.join(" "));
  }

  tokens.forEach((token) => {
    if (token.length >= 3) {
      keywords.add(token);
    }
  });

  return Array.from(keywords);
};

const parseFileName = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const stem = path.basename(fileName, ext);

  const prefixedMatch = stem.match(/^(\d+)_?(.*)$/);
  const sourceId = prefixedMatch ? prefixedMatch[1] : "";
  const rawName = prefixedMatch ? prefixedMatch[2] : stem;

  const normalizedName = rawName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const displayName = titleCase(normalizedName || stem);
  const slug = toNormalized(normalizedName || stem).replace(/\s+/g, "-");

  return {
    sourceId,
    displayName,
    slug,
    keywords: buildKeywords(normalizedName || stem),
  };
};

if (!fs.existsSync(SOURCE_DIR)) {
  throw new Error(`Video source directory does not exist: ${SOURCE_DIR}`);
}

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

const entries = fs
  .readdirSync(SOURCE_DIR)
  .filter((fileName) => VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
  .sort((a, b) => a.localeCompare(b));

const index = entries.map((fileName) => {
  const parsed = parseFileName(fileName);
  return {
    id: parsed.slug || path.basename(fileName, path.extname(fileName)).toLowerCase(),
    sourceId: parsed.sourceId,
    exerciseLabel: parsed.displayName,
    fileName,
    localUrl: `/exercise-videos/${fileName}`,
    keywords: parsed.keywords,
  };
});

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");

console.log(`Indexed ${index.length} videos.`);
console.log(`Output: ${OUTPUT_FILE}`);
