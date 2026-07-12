#!/usr/bin/env node
// T-048 / issue #5: deterministic test file discovery.
//
// `tsx --test "src/**/*.test.ts"` does not expand globs on Linux and
// treats the pattern as a literal filename, so CI fails with
// "Could not find .../src/...". Windows shells happen to expand the
// glob, masking the bug locally.
//
// This script walks <packageRoot>/src recursively, collects *.test.ts,
// sorts them, fails when zero files are found, and spawns
// `node --import tsx --test <files...>` so the file list is explicit
// and shell-independent (Linux, Windows, npm-script).
//
// Usage:
//   node scripts/run-tests.mjs [packageRoot]
//
// When no packageRoot is given, defaults to the current working directory
// (i.e. the package that invokes the script via npm test).

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

async function listTestFiles(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await listTestFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

async function main() {
  const pkgRoot = process.argv[2]
    ? resolve(process.argv[2])
    : process.cwd();

  const srcDir = join(pkgRoot, "src");
  let isDir = false;
  try {
    const s = await stat(srcDir);
    isDir = s.isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    console.error(`[run-tests] no src directory at ${srcDir}`);
    process.exit(1);
  }

  const files = (await listTestFiles(srcDir)).sort();
  if (files.length === 0) {
    console.error(
      `[run-tests] no *.test.ts files found under ${srcDir}; refusing to pass with zero tests`,
    );
    process.exit(1);
  }

  console.info(
    `[run-tests] discovered ${files.length} test file(s):\n` +
      files.map((f) => "  " + f).join("\n"),
  );

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", ...files],
    { stdio: "inherit" },
  );
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
