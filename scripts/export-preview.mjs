#!/usr/bin/env node
import { realpath, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const endpoint = "/digest/2026-10-28";

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const version = isIP(host);
  if (version === 4) return Number(host.split(".")[0]) === 127;
  return version === 6 && host === "::1";
}

function isWithin(parent, target) {
  const path = relative(parent, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function canonicalTarget(path) {
  const absolute = resolve(path);
  let ancestor = absolute;
  const missing = [];
  while (true) {
    try {
      const realAncestor = await realpath(ancestor);
      return resolve(realAncestor, ...missing.reverse());
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(ancestor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      ancestor = parent;
    }
  }
}

export async function exportPreview(baseUrl, outputPath) {
  const source = new URL(baseUrl);
  if (!["http:", "https:"].includes(source.protocol) || !isLoopback(source.hostname)) {
    throw new Error("source must be an HTTP(S) loopback URL");
  }
  if (source.username || source.password) throw new Error("source URL must not contain credentials");
  if (!outputPath || !isAbsolute(outputPath)) throw new Error("output path must be an absolute path");

  const root = await realpath(repoRoot);
  const target = await canonicalTarget(outputPath);
  if (isWithin(root, target)) throw new Error("refusing to write inside the repository/worktree");

  source.pathname = endpoint;
  source.search = "";
  source.hash = "";
  const response = await fetch(source, { redirect: "error" });
  if (!response.ok) throw new Error(`server returned HTTP ${response.status}`);
  const html = await response.text();
  await writeFile(target, html, { encoding: "utf8", flag: "w" });
  return { path: target, bytes: Buffer.byteLength(html, "utf8") };
}

async function main(args) {
  if (args.length < 1 || args.length > 2 || args[0] === "--help" || args[0] === "-h") {
    console.error("Usage: node scripts/export-preview.mjs <absolute-output-path> [loopback-base-url]");
    process.exitCode = args[0] === "--help" || args[0] === "-h" ? 0 : 2;
    return;
  }
  try {
    const result = await exportPreview(args[1] ?? "http://127.0.0.1:8787", args[0]);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "export failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
