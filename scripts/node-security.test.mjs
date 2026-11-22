import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newerSecurityReleases } from "./node-security.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "node-security.mjs");

const index = [
  { version: "v25.1.0", security: true },
  { version: "v24.22.10", security: true },
  { version: "v24.22.9", security: true },
  { version: "v24.22.4", security: false },
  { version: "v24.22.3", security: true },
  { version: "v24.22.0", security: true },
  { version: "v24.21.0", security: true },
  { version: "v22.5.0", security: true },
];

test("returns nothing when current is the newest", () => {
  assert.deepEqual(newerSecurityReleases("v24.22.10", index), []);
});

test("ignores newer non-security releases", () => {
  const only = [{ version: "v24.22.3", security: true }, { version: "v24.22.4", security: false }];
  assert.deepEqual(newerSecurityReleases("v24.22.3", only), []);
});

test("lists newer security releases of the same major, newest first", () => {
  assert.deepEqual(newerSecurityReleases("v24.22.3", index), ["v24.22.10", "v24.22.9"]);
});

test("ignores security releases of other majors", () => {
  assert.deepEqual(newerSecurityReleases("v22.5.0", index), []);
});

test("ignores older security releases", () => {
  assert.deepEqual(newerSecurityReleases("v24.22.9", index), ["v24.22.10"]);
  assert.deepEqual(newerSecurityReleases("v24.22.10", index), []);
});

test("compares numerically, not lexically", () => {
  assert.deepEqual(newerSecurityReleases("24.22.9", index), ["v24.22.10"]);
});

test("accepts current without a leading v", () => {
  assert.deepEqual(newerSecurityReleases("24.22.3", index), ["v24.22.10", "v24.22.9"]);
});

function withIndex(content, run) {
  const dir = mkdtempSync(join(tmpdir(), "node-security-"));
  try {
    const path = join(dir, "index.json");
    if (content !== null) writeFileSync(path, content);
    return run(dir, path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fixture = JSON.stringify(index);

function cli(args) {
  return spawnSync("node", [script, ...args], { encoding: "utf8" });
}

function assertFailsClosed(result) {
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^[^\n]+\n$/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
  assert.equal(result.stdout, "");
}

test("cli exits 0 when current is the latest security release", () => {
  withIndex(fixture, (_dir, path) => {
    const result = cli(["--current", "v24.22.10", "--index", path]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "Node v24.22.10 is the latest security release of v24\n");
  });
});

test("cli trims whitespace around current", () => {
  withIndex(fixture, (_dir, path) => {
    const result = cli(["--current", "v24.22.10\n", "--index", path]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Node v24\.22\.10 is the latest/);
  });
});

test("cli exits 1 and lists newer security releases", () => {
  withIndex(fixture, (_dir, path) => {
    const result = cli(["--current", "v24.22.3", "--index", path]);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Production runs Node v24\.22\.3; security release\(s\) v24\.22\.10, v24\.22\.9 exist\. Rebuild and redeploy the backend\./,
    );
  });
});

test("cli fails closed when the index is unreadable", () => {
  withIndex(null, (dir) => {
    assertFailsClosed(cli(["--current", "v24.22.3", "--index", join(dir, "missing.json")]));
  });
});

test("cli fails closed when the index is not JSON", () => {
  withIndex("not json", (_dir, path) => {
    assertFailsClosed(cli(["--current", "v24.22.3", "--index", path]));
  });
});

test("cli fails closed when the index is not an array", () => {
  withIndex("{}", (_dir, path) => {
    assertFailsClosed(cli(["--current", "v24.22.3", "--index", path]));
  });
});

test("cli fails closed on an invalid current version", () => {
  withIndex(fixture, (_dir, path) => {
    assertFailsClosed(cli(["--current", "latest", "--index", path]));
    assertFailsClosed(cli(["--current", "v24.22", "--index", path]));
  });
});

test("cli fails closed when the major has no entries in the index", () => {
  withIndex(fixture, (_dir, path) => {
    assertFailsClosed(cli(["--current", "v99.0.0", "--index", path]));
  });
});

test("cli fails closed on missing or unknown args", () => {
  withIndex(fixture, (_dir, path) => {
    assertFailsClosed(cli([]));
    assertFailsClosed(cli(["--current", "v24.22.3"]));
    assertFailsClosed(cli(["--index", path]));
    assertFailsClosed(cli(["--current", "v24.22.3", "--index", path, "--bogus", "x"]));
    assertFailsClosed(cli(["--current"]));
  });
});

test("cli runs when invoked through a symlinked path", () => {
  withIndex(fixture, (dir, path) => {
    symlinkSync(dirname(script), join(dir, "linked"));
    const result = spawnSync(
      "node",
      [join(dir, "linked/node-security.mjs"), "--current", "v24.22.3", "--index", path],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Production runs Node v24\.22\.3/);
  });
});
