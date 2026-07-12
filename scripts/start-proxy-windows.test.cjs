const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { describe, it } = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "start-proxy-windows.ps1");

describe("start-proxy-windows.ps1", () => {
  it("loads .env in dry-run mode without printing secrets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gekiyasu-env-"));
    const envFile = path.join(dir, ".env");
    const secret = "sk-test-secret-value";
    const token = "proxy-secret-value";
    fs.writeFileSync(
      envFile,
      [
        "# comment",
        "GEKIYASU_UPSTREAM_BASE_URL=https://example.test/v1",
        `GEKIYASU_UPSTREAM_API_KEY=${secret}`,
        `GEKIYASU_PROXY_TOKEN='${token}'`,
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-EnvFile",
        envFile,
        "-DryRun",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stdout.includes(token), false);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.envFileExists, true);
    assert.equal(parsed.upstreamBaseUrlSet, true);
    assert.equal(parsed.upstreamKeySet, true);
    assert.equal(parsed.proxyTokenRequired, true);
    assert.equal(parsed.npmScript, "dev");
  });
});
