#!/usr/bin/env node
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const usesLine = /^\s*(?:-\s+)?uses:\s*(.*?)\s*$/;
const shaPinned = /^[^\s@]+@[0-9a-f]{40}$/;
const dockerPinned = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/;

function refOf(rawValue) {
  const quoted = rawValue.match(/^(['"])(.*?)\1/);
  if (quoted) return quoted[2];
  return rawValue.replace(/\s+#.*$/, "");
}

function isPinned(ref) {
  return ref.startsWith("./") || shaPinned.test(ref) || dockerPinned.test(ref);
}

export function unpinnedUses(text) {
  const hits = [];
  text.split("\n").forEach((content, index) => {
    const match = content.match(usesLine);
    if (!match) return;
    const ref = refOf(match[1]);
    if (!isPinned(ref)) hits.push({ line: index + 1, ref });
  });
  return hits;
}

function main() {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const workflows = join(root, ".github/workflows");
  let names = [];
  try {
    names = readdirSync(workflows);
  } catch {
    names = [];
  }
  const files = names.filter((name) => /\.ya?ml$/.test(name)).sort();
  if (files.length === 0) {
    console.error(`No workflow files found in ${workflows}`);
    process.exit(1);
  }
  let failed = false;
  for (const name of files) {
    for (const { line, ref } of unpinnedUses(readFileSync(join(workflows, name), "utf8"))) {
      console.log(`.github/workflows/${name}:${line} ${ref}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log("All actions are pinned by SHA");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
