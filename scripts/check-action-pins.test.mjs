import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unpinnedUses } from "./check-action-pins.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-action-pins.mjs");
const sha = "0123456789abcdef0123456789abcdef01234567";
const digest = `sha256:${"b".repeat(64)}`;

test("accepts full SHA pins, with and without a path or dash", () => {
  assert.deepEqual(unpinnedUses(`uses: owner/repo@${sha}`), []);
  assert.deepEqual(unpinnedUses(`      - uses: owner/repo/path@${sha}  `), []);
});

test("accepts quoted SHA pins", () => {
  assert.deepEqual(unpinnedUses(`uses: 'owner/repo@${sha}'`), []);
  assert.deepEqual(unpinnedUses(`uses: "owner/repo@${sha}"`), []);
});

test("accepts local actions", () => {
  assert.deepEqual(unpinnedUses("uses: ./local-action"), []);
});

test("reports tags, branches, short and uppercase SHAs with line numbers", () => {
  const text = [
    "steps:",
    "  - uses: actions/checkout@v4",
    "  - uses: actions/checkout@main",
    `  - uses: actions/checkout@${sha.slice(1)}`,
    `  - uses: actions/checkout@${sha.toUpperCase()}`,
  ].join("\n");
  assert.deepEqual(unpinnedUses(text), [
    { line: 2, ref: "actions/checkout@v4" },
    { line: 3, ref: "actions/checkout@main" },
    { line: 4, ref: `actions/checkout@${sha.slice(1)}` },
    { line: 5, ref: `actions/checkout@${sha.toUpperCase()}` },
  ]);
});

test("docker refs need a sha256 digest", () => {
  assert.deepEqual(unpinnedUses("uses: docker://alpine:3"), [{ line: 1, ref: "docker://alpine:3" }]);
  assert.deepEqual(unpinnedUses(`uses: docker://alpine@${digest}`), []);
});

test("ignores uses when it is not a key", () => {
  assert.deepEqual(unpinnedUses("run: echo uses: actions/checkout@v4\nname: uses: x"), []);
});

test("cli exits 1 and prints file:line for a tag-pinned workflow", () => {
  const dir = mkdtempSync(join(tmpdir(), "action-pins-"));
  try {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), "steps:\n  - uses: actions/checkout@v4\n");
    const result = spawnSync("node", [script, dir], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\.github\/workflows\/ci\.yml:2 actions\/checkout@v4/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli exits 0 when every action is pinned", () => {
  const dir = mkdtempSync(join(tmpdir(), "action-pins-"));
  try {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), `steps:\n  - uses: actions/checkout@${sha}\n`);
    const result = spawnSync("node", [script, dir], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /All actions are pinned by SHA/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
