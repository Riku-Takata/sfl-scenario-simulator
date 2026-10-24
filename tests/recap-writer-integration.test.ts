import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("local writing survives continuation ticks, rejects stale drafts, and stops after bounded quality failures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-writer-pipeline-"));
  const dataDirectory = path.join(root, "src/data");
  fs.mkdirSync(dataDirectory, { recursive: true });
  for (const name of ["raw-capcom-seed", "video-facts", "editorial-recaps", "match-recaps"]) {
    fs.copyFileSync(new URL(`../src/data/${name}.json`, import.meta.url), path.join(dataDirectory, name + ".json"));
  }
  try {
    const run = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("fixtures/recap-local-writer.ts", import.meta.url)), root], { encoding: "utf8", timeout: 60_000, windowsHide: true });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /LOCAL_WRITER_PIPELINE_OK/);
  } finally {
    // The fixture only creates flat JSON files in this explicitly created directory.
    for (const name of fs.readdirSync(dataDirectory)) fs.unlinkSync(path.join(dataDirectory, name));
    fs.rmdirSync(dataDirectory); fs.rmdirSync(path.join(root, "src")); fs.rmdirSync(root);
  }
});
