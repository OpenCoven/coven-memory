import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function compareFixtureDirectories(hostPath, iosPath) {
  const host = resolve(hostPath);
  const ios = resolve(iosPath);
  const names = (await readdir(host)).sort();
  const iosNames = (await readdir(ios)).sort();

  if (JSON.stringify(names) !== JSON.stringify(iosNames)) {
    throw new Error("mobile contract fixture file sets differ");
  }

  for (const name of names) {
    const [left, right] = await Promise.all([
      readFile(resolve(host, name)),
      readFile(resolve(ios, name))
    ]);
    if (!left.equals(right)) {
      throw new Error(`mobile contract fixture differs: ${name}`);
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 4) {
    throw new Error(
      "usage: check-mobile-contract.mjs <host-fixtures> <ios-fixtures>"
    );
  }
  await compareFixtureDirectories(process.argv[2], process.argv[3]);
}
