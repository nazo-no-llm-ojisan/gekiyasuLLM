/**
 * pm2 process file for local gekiyasuLLMProxy.
 *
 * Usage (repo root):
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs gekiyasu-proxy
 *   pm2 restart gekiyasu-proxy
 *   pm2 stop gekiyasu-proxy
 *
 * Loads packages/proxy/.env into the process env (file is gitignored).
 * Does not print or commit secret values.
 */

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = __dirname;
const proxyDir = path.join(repoRoot, "packages", "proxy");
const envFile = path.join(proxyDir, ".env");

/**
 * @param {string} file
 * @returns {Record<string, string>}
 */
function loadDotEnv(file) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(file)) return out;

  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name) out[name] = value;
  }
  return out;
}

const fileEnv = loadDotEnv(envFile);

module.exports = {
  apps: [
    {
      name: "gekiyasu-proxy",
      cwd: proxyDir,
      // tsx keeps src current without a separate build step for local use
      script: path.join(proxyDir, "node_modules", "tsx", "dist", "cli.mjs"),
      args: "src/index.ts serve",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        ...fileEnv,
      },
    },
  ],
};
