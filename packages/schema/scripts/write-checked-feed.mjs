import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFeedFromManifest } from "../dist/feed-generator.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const manifestPath = resolve(repoRoot, "fixtures/pricing/manifest.json");
const checkedPath = resolve(repoRoot, "fixtures/feeds/vertical-slice-2providers.json");

const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const f = generateFeedFromManifest(m, repoRoot);
writeFileSync(checkedPath, JSON.stringify(f, null, 2) + "\n", "utf8");
process.stdout.write("wrote " + checkedPath + "\n");
