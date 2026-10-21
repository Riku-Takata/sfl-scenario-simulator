import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA || (() => {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
  catch { return process.env.GITHUB_SHA || "unknown"; }
})();
const matches = readJson("src/data/matches.json");
const recaps = readJson("src/data/match-recaps.json");
const contentHash = createHash("sha256")
  .update(JSON.stringify({ matches, recaps }))
  .digest("hex");
const buildInfo = {
  service: "sfl-scenario-simulator",
  sourceCommit,
  contentHash,
  buildId: `${sourceCommit}-${contentHash.slice(0, 16)}`,
  resultsUpdatedAt: matches.updatedAt,
  recapsUpdatedAt: recaps.updatedAt,
  latestSection: recaps.latestSection,
};
const output = resolve(root, "public/build-info.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(`[BuildInfo] ${buildInfo.buildId}`);
