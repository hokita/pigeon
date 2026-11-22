#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;

class UsageError extends Error {}

function parseVersion(text) {
  const match = String(text).trim().match(versionPattern);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function entriesOfMajor(index, major) {
  return index
    .map((entry) => ({ entry, parts: parseVersion(entry?.version) }))
    .filter(({ parts }) => parts !== null && parts[0] === major);
}

export function newerSecurityReleases(current, index) {
  const currentParts = parseVersion(current);
  if (!currentParts) throw new UsageError(`Invalid Node version: ${String(current).trim()}`);
  return entriesOfMajor(index, currentParts[0])
    .filter(({ entry, parts }) => entry.security === true && compare(parts, currentParts) > 0)
    .sort((a, b) => compare(b.parts, a.parts))
    .map(({ entry }) => entry.version);
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag !== "--current" && flag !== "--index") || value === undefined) {
      throw new UsageError("Usage: node-security.mjs --current <version> --index <path>");
    }
    values[flag.slice(2)] = value;
  }
  if (values.current === undefined || values.index === undefined) {
    throw new UsageError("Usage: node-security.mjs --current <version> --index <path>");
  }
  return values;
}

function readIndex(path) {
  let index;
  try {
    index = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UsageError(`Cannot read Node index ${path}: ${error.message}`);
  }
  if (!Array.isArray(index)) throw new UsageError(`Node index ${path} is not a JSON array`);
  return index;
}

function run(argv) {
  const { current: rawCurrent, index: indexPath } = parseArgs(argv);
  const current = rawCurrent.trim();
  const parts = parseVersion(current);
  if (!parts) throw new UsageError(`Invalid Node version: ${current}`);
  const index = readIndex(indexPath);
  if (entriesOfMajor(index, parts[0]).length === 0) {
    throw new UsageError(`No entries for Node v${parts[0]} in ${indexPath}`);
  }
  const newer = newerSecurityReleases(current, index);
  const label = current.startsWith("v") ? current : `v${current}`;
  if (newer.length === 0) {
    console.log(`Node ${label} is the latest security release of v${parts[0]}`);
    return 0;
  }
  console.error(
    `Production runs Node ${label}; security release(s) ${newer.join(", ")} exist. Rebuild and redeploy the backend.`,
  );
  return 1;
}

function main() {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message.split("\n")[0]);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
