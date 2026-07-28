#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LOCK_PATH = path.resolve(here, "..", ".product-cpu-package.lock");

const sleep = (milliseconds) => {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
};

export function acquirePackageLock(lockPath = DEFAULT_LOCK_PATH, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(
        path.join(lockPath, "owner.json"),
        `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`
      );
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(
          `product CPU package lock is busy: ${lockPath} (remove it only if no sync, pack, or publish is running)`
        );
      }
      sleep(50);
    }
  }
}

export function releasePackageLock(lockPath = DEFAULT_LOCK_PATH) {
  fs.rmSync(lockPath, { recursive: true, force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2];
    if (action === "acquire") acquirePackageLock();
    else if (action === "release") releasePackageLock();
    else throw new Error("usage: product-cpu-package-lock.mjs <acquire|release>");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
