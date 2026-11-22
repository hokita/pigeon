import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const digest = `sha256:${"a".repeat(64)}`;

function withCopy(mutateDockerfile, run) {
  const dir = mkdtempSync(join(tmpdir(), "node-pins-"));
  try {
    const files = [
      "scripts/check-node-pins.sh",
      "backend/Dockerfile",
      "backend/package.json",
      "frontend/package.json",
      "e2e/package.json",
      ...readdirSync(join(root, ".github/workflows"))
        .filter((f) => f.endsWith(".yml"))
        .map((f) => `.github/workflows/${f}`),
    ];
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      cpSync(join(root, file), join(dir, file));
    }
    const dockerfile = join(dir, "backend/Dockerfile");
    writeFileSync(dockerfile, mutateDockerfile(readFileSync(dockerfile, "utf8")));
    run(spawnSync("bash", [join(dir, "scripts/check-node-pins.sh")], { encoding: "utf8" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const rewriteFroms = (suffix) => (text) =>
  text.replace(/^FROM node:\S+/gm, `FROM node:${suffix}`);

test("accepts FROM node:24.22.3-alpine@sha256:<64 hex> in every stage", () => {
  withCopy(rewriteFroms(`24.22.3-alpine@${digest}`), (result) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test("rejects a FROM without a digest", () => {
  withCopy(rewriteFroms("24.22.3-alpine"), (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /wrong Dockerfile FROM/);
  });
});

test("rejects a short or uppercase digest", () => {
  for (const bad of [`sha256:${"a".repeat(63)}`, `sha256:${"A".repeat(64)}`]) {
    withCopy(rewriteFroms(`24.22.3-alpine@${bad}`), (result) => {
      assert.equal(result.status, 1);
    });
  }
});

test("rejects a digest-pinned FROM with another version", () => {
  withCopy(rewriteFroms(`24.22.1-alpine@${digest}`), (result) => {
    assert.equal(result.status, 1);
  });
});
