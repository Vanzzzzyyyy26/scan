/**
 * Push server/.env keys to Vercel Environment Variables.
 *
 * Prerequisites:
 *   1. npm i -D vercel   (or use npx)
 *   2. cmd /c "npx vercel login"
 *   3. cmd /c "npx vercel link"   (link this folder to your Vercel project)
 *
 * Usage:
 *   cmd /c "node scripts/push-vercel-env.js"
 *
 * Then redeploy:
 *   cmd /c "npx vercel --prod"
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ENV_FILE = path.join(ROOT, "server", ".env");

const KEYS = [
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
  "MYSQL_SSL",
  "MYSQL_URL",
  "PLANTNET_API_KEY",
  "HF_TOKEN",
  "PLANTNET_PROJECT",
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Create server/.env first.`);
  }
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function vercel(args, input) {
  const result = spawnSync("npx", ["vercel", ...args], {
    cwd: ROOT,
    input: input != null ? String(input) : undefined,
    encoding: "utf8",
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result;
}

function main() {
  const env = parseEnvFile(ENV_FILE);
  const toPush = KEYS.filter((k) => env[k] != null && String(env[k]).length > 0);

  if (toPush.length === 0) {
    console.error("No matching keys found in server/.env");
    process.exit(1);
  }

  console.log("Will push to Vercel (Production + Preview + Development):");
  for (const k of toPush) {
    const masked =
      /PASSWORD|TOKEN|KEY|URL/i.test(k) && env[k].length > 6
        ? `${env[k].slice(0, 4)}…${env[k].slice(-2)}`
        : env[k];
    console.log(`  ${k}=${masked}`);
  }

  // Ensure project is linked
  if (!fs.existsSync(path.join(ROOT, ".vercel", "project.json"))) {
    console.error(
      "\nProject not linked. Run first:\n  cmd /c \"npx vercel link\"\n"
    );
    process.exit(1);
  }

  for (const key of toPush) {
    const value = env[key];
    // Remove existing (ignore errors if missing), then add for all envs.
    spawnSync("npx", ["vercel", "env", "rm", key, "production", "-y"], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore",
    });
    spawnSync("npx", ["vercel", "env", "rm", key, "preview", "-y"], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore",
    });
    spawnSync("npx", ["vercel", "env", "rm", key, "development", "-y"], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore",
    });

    for (const target of ["production", "preview", "development"]) {
      const result = vercel(
        ["env", "add", key, target, "--force"],
        `${value}\n`
      );
      if (result.status !== 0) {
        console.error(
          `FAILED ${key} (${target}):`,
          result.stderr || result.stdout
        );
        process.exit(1);
      }
      console.log(`OK  ${key} → ${target}`);
    }
  }

  console.log(
    "\nDone. Redeploy so the new vars apply:\n  cmd /c \"npx vercel --prod\"\n  or: Vercel Dashboard → Deployments → Redeploy\n"
  );
}

main();
