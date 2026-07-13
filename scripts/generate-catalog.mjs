import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const DEFAULT_SOURCE_FEED = "fixtures/feeds/vertical-slice-2providers.json";
const DEFAULT_OUTPUT = "docs/catalog/data.js";

/**
 * @param {object} feed - parsed GekiyasuFeed JSON
 * @param {string} sourceRelPath - relative source feed path for the header comment
 * @returns {string} generated data.js content
 */
export function generateDataJs(feed, sourceRelPath) {
  const header = [
    "// GENERATED FILE — DO NOT EDIT",
    `// Source: ${sourceRelPath}`,
    "// Regenerate: node scripts/generate-catalog.mjs",
    "//",
    "// Static unsigned non-production catalog.",
    "// This catalog does NOT relay requests.",
    "// NOT a signed production feed.",
    "",
  ].join("\n");

  return header + "var FEED_DATA = " + JSON.stringify(feed, null, 2) + ";\n";
}

function main() {
  const sourceRelPath = process.argv[2] || DEFAULT_SOURCE_FEED;
  const outputRelPath = process.argv[3] || DEFAULT_OUTPUT;
  const sourcePath = resolve(repoRoot, sourceRelPath);
  const outputPath = resolve(repoRoot, outputRelPath);

  const feed = JSON.parse(readFileSync(sourcePath, "utf8"));
  const js = generateDataJs(feed, sourceRelPath);
  writeFileSync(outputPath, js, "utf8");
  process.stdout.write(`Generated ${outputRelPath} from ${sourceRelPath}\n`);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirect) {
  main();
}
